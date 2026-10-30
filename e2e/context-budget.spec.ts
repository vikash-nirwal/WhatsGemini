import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, sendMessage, waitForReplyDone, ARIA } from "./fixtures";

// Keeping context down (the user's ask, 2026-10-30): the recent chat word for
// word and older messages summarised, a switch for statuses, and a count of
// where the tokens go.

const patchAria = (page: Page, fields: Record<string, unknown>) =>
  page.evaluate(async ({ id, fields }) => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("characters", "readwrite");
      const store = tx.objectStore("characters");
      const get = store.get(id);
      get.onsuccess = () => store.put({ ...get.result, ...fields });
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, { id: ARIA.id, fields });

test.describe("by size", () => {
  // About 300 tokens of chat, against 100 kept word for word.
  test.use({ seed: { messages: 30 }, localStorageOverrides: { history_keep_tokens: "100" } });

  test("older messages are summarised and only the recent ones go word for word", async ({ page, mockAI }) => {
    mockAI.reply((req) => (req.prompt.includes("Summarize the following roleplay conversation") ? "Story so far: Aria and the user talked about their days." : "Mock reply"));
    await openChat(page);
    await sendMessage(page, "hello again");
    await waitForReplyDone(page);
    const summary = mockAI.requests.find((r) => r.prompt.includes("Summarize the following roleplay conversation"));
    expect(summary?.prompt).toContain("If you're unsure whether a detail matters, keep it.");
    expect(summary?.prompt).toContain("Aria message 1:");
    const reply = mockAI.requests.filter((r) => r.stream).pop()!;
    const sent = reply.messages.map((m) => m.content).join("\n");
    expect(sent).toContain("Aria and the user talked about their days.");
    expect(sent).not.toContain("Aria message 1:");
    expect(sent).toContain("hello again");
  });
});

test.describe("statuses", () => {
  test.use({ seed: { messages: 4 } });

  test("switched off, nobody posts one", async ({ page, mockAI }) => {
    await page.clock.install();
    mockAI.reply("A status");
    await openRoute(page, "/settings/spending");
    await page.getByRole("switch", { name: "Statuses" }).click();
    await expect(page.getByText("Off: nobody posts statuses")).toBeVisible();
    await openChat(page);
    await patchAria(page, { postsStatuses: true });
    await page.reload();
    await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
    await page.clock.fastForward(20_000);
    await page.clock.fastForward(60_000);
    expect(mockAI.requests.filter((r) => r.prompt.includes("Write one short status update"))).toHaveLength(0);
  });
});

test.describe("tokens", () => {
  test.use({ seed: { messages: 4 } });

  test("a reply is counted under chat replies", async ({ page, mockAI }) => {
    mockAI.reply("Mock reply");
    await openChat(page);
    await sendMessage(page, "hi");
    await waitForReplyDone(page);
    await openRoute(page, "/settings/spending");
    const card = page.getByRole("region", { name: "Where the tokens go" });
    await card.getByRole("button", { name: "Today" }).click();
    await expect(card.getByRole("row", { name: /Chat and adventure replies/ })).toBeVisible();
  });
});
