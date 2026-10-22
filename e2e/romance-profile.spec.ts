import type { Page } from "@playwright/test";
import { test, expect, openChat, sendMessage, waitForReplyDone, headerAction, ARIA, KAI } from "./fixtures";

// Intimacy profile (#73): only in romantic scenes. Characters know about
// each other (#74): a character can know about your other bonds.

test.use({ seed: { messages: 4, room: true } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

const patchDb = (page: Page, fn: string) =>
  page.evaluate(async (body) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(["characters", "chats"], "readwrite");
      // eslint-disable-next-line no-new-func
      new Function("tx", body)(tx);
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, fn);

test("the intimacy profile joins the prompt only once the talk turns romantic", async ({ page, mockAI }) => {
  mockAI.reply("Mm.");
  await openChat(page);
  await patchDb(page, `const s = tx.objectStore("characters"); const g = s.get(${ARIA.id}); g.onsuccess = () => s.put({ ...g.result, intimacy: { loveLanguage: "quality time", flirting: "dry jokes and long looks" } });`);
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await sendMessage(page, "How was work today?");
  await waitForReplyDone(page);
  expect(systemOf(mockAI.requests[0].messages)).not.toContain("Aria in romance");

  await sendMessage(page, "Come here, I want to kiss you.");
  await expect.poll(() => mockAI.requests.length).toBe(2);
  expect(systemOf(mockAI.requests[1].messages)).toContain("Aria in romance (stay true to it):\n- Love language: quality time");
});

test("a character can know about your bond with another", async ({ page, mockAI }) => {
  mockAI.reply("Oh? And how is Kai these days?");
  await openChat(page);
  await patchDb(page, `tx.objectStore("chats").put({ id: 3, title: "Kai", timestamp: Date.now(), characterIds: [${KAI.id}], content: [{ id: "k1", role: "you", txt: "Hey Kai", timestamp: Date.now() - 3600000 }] });`);
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await headerAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page.getByRole("switch", { name: "Aria knows about Kai" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await sendMessage(page, "I saw Kai yesterday.");
  await expect.poll(() => systemOf(mockAI.requests[0]?.messages || [])).toContain("Aria knows the user is also close to others:\n- Kai (Rival): they've talked now and then this week.");
});
