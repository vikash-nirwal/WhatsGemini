import type { Page } from "@playwright/test";
import { test, expect, openChat, sendMessage, waitForReplyDone, headerAction, MockAIRequest } from "./fixtures";

// Shared plans (#84): plans you make with the character, in the Story tab;
// added by hand or noticed in the chat, remembered, brought up on the day
// and ticked off when they happen.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";
const isPlanCheck = (req: MockAIRequest) => req.prompt.includes("Did they just agree on something new");
const replies = (requests: MockAIRequest[]) => requests.filter((r) => r.stream);

const openStoryTab = async (page: Page) => {
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: "Story", exact: true }).click();
};
const closePanel = (page: Page) => page.getByRole("button", { name: "Close scene panel" }).click();

const patchChat = (page: Page, fields: Record<string, unknown>) =>
  page.evaluate(async (fields) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("chats", "readwrite");
      const store = tx.objectStore("chats");
      const get = store.get(1);
      get.onsuccess = () => store.put({ ...get.result, ...fields });
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, fields);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("a plan added by hand is remembered, and can be ticked off and removed", async ({ page, mockAI }) => {
  await openChat(page);
  await openStoryTab(page);
  await page.getByRole("textbox", { name: "New plan" }).fill("Stargazing on the roof");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const list = page.getByRole("list", { name: "Plans together" });
  await expect(list).toContainText("Stargazing on the roof");
  await closePanel(page);

  await sendMessage(page, "Still on for later?");
  await waitForReplyDone(page);
  await expect.poll(() => replies(mockAI.requests).length).toBe(1);
  expect(systemOf(replies(mockAI.requests)[0].messages)).toContain("- Stargazing on the roof");
  // Notice plans is off by default, so no helper check ran.
  expect(mockAI.requests.filter(isPlanCheck)).toHaveLength(0);

  await openStoryTab(page);
  await page.getByRole("checkbox", { name: "Done: Stargazing on the roof" }).click();
  await expect(page.getByRole("checkbox", { name: "Done: Stargazing on the roof" })).toBeChecked();
  await closePanel(page);
  await sendMessage(page, "That was lovely.");
  await waitForReplyDone(page);
  await expect.poll(() => replies(mockAI.requests).length).toBe(2);
  expect(systemOf(replies(mockAI.requests)[1].messages)).not.toContain("Stargazing on the roof");

  await openStoryTab(page);
  await page.getByRole("button", { name: "Remove plan: Stargazing on the roof" }).click();
  await expect(page.getByText("No plans yet.")).toBeVisible();
});

test("with Notice plans on, a plan made in the chat is added, and ticked off when it happens", async ({ page, mockAI }) => {
  let checks = 0;
  mockAI.reply((req) => {
    if (!isPlanCheck(req)) return req.prompt.includes("picnic") ? "*spreads the blanket* Perfect spot." : "Saturday it is!";
    checks++;
    return checks === 1 ? '{"new": [{"what": "Picnic by the lake", "when": "Saturday", "date": ""}], "done": []}' : '{"new": [], "done": [1]}';
  });
  await openChat(page);
  await openStoryTab(page);
  await page.getByRole("switch", { name: "Notice plans you make with Aria" }).click();
  await closePanel(page);

  await sendMessage(page, "Let's have a picnic by the lake on Saturday");
  await waitForReplyDone(page);
  await expect.poll(() => mockAI.requests.filter(isPlanCheck).length).toBe(1);
  await openStoryTab(page);
  await expect(page.getByRole("list", { name: "Plans together" })).toContainText("Picnic by the lake · Saturday");
  await closePanel(page);

  await sendMessage(page, "*unpacks the picnic basket*");
  await waitForReplyDone(page);
  await expect.poll(() => mockAI.requests.filter(isPlanCheck).length).toBe(2);
  expect(mockAI.requests.filter(isPlanCheck)[1].prompt).toContain("1. Picnic by the lake (Saturday)");
  await openStoryTab(page);
  await expect(page.getByRole("checkbox", { name: "Done: Picnic by the lake" })).toBeChecked();
});

test("on the plan's day, the character is told to bring it up", async ({ page, mockAI }) => {
  await openChat(page);
  await patchChat(page, { plans: [{ id: "p1", what: "Picnic by the lake", when: "today", date: today(), createdAt: Date.now() - 86_400_000 }] });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await sendMessage(page, "Morning!");
  await waitForReplyDone(page);
  await expect.poll(() => replies(mockAI.requests).length).toBe(1);
  expect(systemOf(replies(mockAI.requests)[0].messages)).toContain("Today is the day for picnic by the lake");
});
