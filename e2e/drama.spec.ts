import type { Page } from "@playwright/test";
import { test, expect, openChat, sendMessage, waitForReplyDone, headerAction, messageBubble, MockAIRequest, ARIA, KAI, openContactInfo } from "./fixtures";

// Drama and conflict (#97-#100): fights that need making up, rumors that get
// around, jealousy over other chats, and lies.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";
const replies = (requests: MockAIRequest[]) => requests.filter((r) => r.stream);
const lastSystem = (requests: MockAIRequest[]) => systemOf(replies(requests).pop()?.messages || []);
// Sends, then waits until that message's reply was asked for and has finished.
const sendAndWait = async (page: Page, requests: MockAIRequest[], text: string) => {
  const before = replies(requests).length;
  await sendMessage(page, text);
  await expect.poll(() => replies(requests).length, { timeout: 15_000 }).toBe(before + 1);
  await waitForReplyDone(page);
};

const openTab = async (page: Page, tab: "Options" | "Story") => {
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: tab, exact: true }).click();
};
const closePanel = (page: Page) => page.getByRole("button", { name: "Close scene panel" }).click();
const closeContact = (page: Page) => page.getByRole("button", { name: "Close contact info" }).click();

const putRow = (page: Page, store: string, row: Record<string, unknown>) =>
  page.evaluate(
    async ({ store, row }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction(store, "readwrite");
        const s = tx.objectStore(store);
        const get = s.get(row.id as number);
        get.onsuccess = () => s.put({ ...(get.result || {}), ...row });
        tx.oncomplete = () => resolve();
      });
      db.close();
    },
    { store, row }
  );

test("a fight lasts until you make up", async ({ page, mockAI }) => {
  mockAI.replyOnce("That really hurt, you know.\n[Upset: you mocked my painting]");
  await openChat(page);
  await openTab(page, "Options");
  await page.getByRole("switch", { name: "Fights that need making up" }).click();
  await closePanel(page);
  await sendAndWait(page, mockAI.requests, "Your painting looks like a toddler did it.");
  expect(lastSystem(mockAI.requests)).toContain("[Upset: what about, in a few words]");

  const hurt = messageBubble(page, "That really hurt");
  await expect(hurt).not.toContainText("[Upset");
  await expect(hurt.getByText("Upset with you")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Aria is upset with you · you mocked my painting" })).toBeVisible();

  // A bare sorry: still upset, and told so.
  mockAI.replyOnce("Right. Sure.");
  await sendMessage(page, "sorry");
  await expect.poll(() => replies(mockAI.requests).length, { timeout: 15_000 }).toBe(2);
  await waitForReplyDone(page);
  expect(lastSystem(mockAI.requests)).toContain("Aria is upset with the user about: you mocked my painting");

  mockAI.replyOnce("...Okay. Thank you for saying that. Come here.\n[Made up]");
  await sendMessage(page, "I'm truly sorry. That was cruel, and your painting means a lot to you.");
  await expect(messageBubble(page, "Thank you for saying that").getByText("Made up")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Aria is upset with you ·")).toHaveCount(0);
});

test("a lie keeps its truth hidden until you ask, and can be caught", async ({ page, mockAI }) => {
  mockAI.replyOnce("I was home all night, reading.\n[Lie: she was at Kai's party]");
  await openChat(page);
  await openTab(page, "Options");
  await page.getByRole("switch", { name: "Aria can lie" }).click();
  await closePanel(page);
  await sendAndWait(page, mockAI.requests, "Where were you last night?");
  await expect(messageBubble(page, "I was home all night")).not.toContainText("Kai's party");

  await openTab(page, "Story");
  await expect(page.getByText("1 standing, 0 caught.")).toBeVisible();
  await page.getByRole("button", { name: "Show the truth" }).click();
  await expect(page.getByRole("list", { name: "Aria's lies" })).toContainText("The truth: she was at Kai's party");
  await closePanel(page);

  mockAI.replyOnce("...Fine. I was at the party.\n[Lie caught: 1]");
  await sendMessage(page, "Kai posted a photo of you at his party.");
  await expect(messageBubble(page, "I was at the party").getByText("Caught in a lie")).toBeVisible({ timeout: 15_000 });
  expect(lastSystem(mockAI.requests)).toContain('1. You said: "I was home all night, reading." (the truth: she was at Kai\'s party)');
  await openTab(page, "Story");
  await expect(page.getByText("0 standing, 1 caught.")).toBeVisible();
});

test("after a lot of time in other chats, the character can notice", async ({ page, mockAI }) => {
  await openChat(page);
  // Kai, and a busy 1:1 chat with him since you last wrote to Aria.
  const now = await page.evaluate(() => Date.now());
  await putRow(page, "characters", { ...KAI });
  await putRow(page, "chats", {
    id: 7,
    title: "Kai",
    timestamp: now,
    characterIds: [KAI.id],
    content: Array.from({ length: 9 }, (_, i) => ({ id: `k-${i}`, role: "you", txt: `hey ${i}`, timestamp: now - 60_000 + i })),
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await openTab(page, "Options");
  await page.getByRole("switch", { name: "Aria notices other chats" }).click();
  await closePanel(page);

  await sendAndWait(page, mockAI.requests, "Hey, I'm back.");
  // Aria doesn't know of Kai, so it's "someone else".
  expect(lastSystem(mockAI.requests)).toContain("has been busy chatting with someone else");
});

test.describe("rumors", () => {
  test.use({ seed: { messages: 30, room: true } });

  test("what you tell one character reaches another in a group, a little wrong", async ({ page, mockAI }) => {
    await page.clock.install();
    mockAI.reply((req) =>
      req.prompt.includes("lets something from it slip")
        ? "TRUTH: The user said they might visit Rome\nHEARD: The user is moving to Rome for good"
        : "Rome?! You're leaving?\n[Rumor raised]"
    );
    await openChat(page, 1);
    await openContactInfo(page);
    await page.getByRole("switch", { name: "What you tell Aria can get around" }).click();
    await closeContact(page);
    await page.clock.fastForward(40_000);
    await expect.poll(() => mockAI.requests.filter((r) => r.prompt.includes("lets something from it slip")).length, { timeout: 15_000 }).toBe(1);

    await openChat(page, 2);
    await sendMessage(page, `@${KAI.name} what's new?`);
    await expect(messageBubble(page, "You're leaving?").getByText("Heard a rumor")).toBeVisible({ timeout: 15_000 });
    expect(lastSystem(mockAI.requests)).toContain(`${KAI.name} heard a rumor about`);
    expect(lastSystem(mockAI.requests)).toContain(`through ${ARIA.name}: "The user is moving to Rome for good"`);
  });
});
