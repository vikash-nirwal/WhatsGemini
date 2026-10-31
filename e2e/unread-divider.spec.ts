import { test, expect, openChat, openRoute, sendMessage } from "./fixtures";
import type { Page } from "@playwright/test";

// "N unread messages" (the user's ask, 2026-10-31): a chat with replies you
// haven't seen opens at a line where they start, like other chat apps.

const BASE = Date.UTC(2026, 0, 15, 12, 0, 0);

// Aria texts `count` times after your last message, and the chat was last
// read before the first of them.
const missReplies = async (page: Page, count: number) => {
  // The open chat saves its own read mark (twice, in the dev build's double
  // effects); leaving it and letting that land first means ours holds.
  await openRoute(page, "/characters");
  await expect.poll(() => page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const c: any = await new Promise((r) => { const g = db.transaction("chats").objectStore("chats").get(1); g.onsuccess = () => r(g.result); });
    db.close();
    return c.readAt != null;
  })).toBe(true);
  await page.waitForTimeout(300);
  await page.evaluate(async ({ count, base }) => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const tx = db.transaction("chats", "readwrite");
    const chats = tx.objectStore("chats");
    const get = chats.get(1);
    get.onsuccess = () => {
      const start = base + 40 * 60_000;
      const extra = Array.from({ length: count }, (_, i) => ({
        id: `missed-${i}`, role: "ai", speakerId: 1, timestamp: start + i * 60_000,
        txt: `Missed text ${i + 1}. ${"It's a long story, so here is a lot more of it to read. ".repeat(4)}`,
      }));
      chats.put({ ...get.result, content: [...get.result.content, ...extra], readAt: start - 1 });
    };
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  }, { count, base: BASE });
};

const reopen = async (page: Page) => {
  // A fresh load first, then the chat, so nothing opens it with old data.
  await page.reload();
  await openRoute(page, "/chat/1");
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
};

test("a chat opens at the unread line, and it goes once you reply", async ({ page, mockAI }) => {
  await openChat(page, 1);
  await missReplies(page, 8);
  await reopen(page);

  const line = page.getByRole("separator", { name: "8 unread messages" });
  await expect(line).toBeVisible();
  // Opened at the line, not at the bottom: the first missed text is on
  // screen, and there's more below.
  await expect(line).toBeInViewport();
  const chat = page.getByRole("main");
  await expect(chat.getByText(/^Missed text 1\./)).toBeInViewport();
  await expect(page.getByRole("button", { name: "Scroll to bottom" })).toBeVisible();

  // Opening it again: everything is read now.
  await reopen(page);
  await expect(page.getByRole("separator", { name: /unread/ })).toHaveCount(0);
});

test("replying makes the unread line go", async ({ page, mockAI }) => {
  await openChat(page, 1);
  await missReplies(page, 1);
  await reopen(page);
  await expect(page.getByRole("separator", { name: "1 unread message" })).toBeVisible();
  mockAI.reply("Glad you're back.");
  await sendMessage(page, "Sorry, I was out.");
  await expect(page.getByText("Glad you're back.").first()).toBeVisible();
  await expect(page.getByRole("separator", { name: /unread/ })).toHaveCount(0);
});
