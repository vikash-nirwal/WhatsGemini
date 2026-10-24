import { test, expect, openChat, sendMessage, waitForReplyDone, chatMessages } from "./fixtures";
import type { Page } from "@playwright/test";

// Lane B's pieces wired into the chat: "Show what was sent" on a reply
// (#31) and a character's own model being the one actually called (#32).

test.use({ seed: { messages: 3 } });

const isTouch = (page: Page) => page.evaluate(() => window.matchMedia("(hover: none)").matches);

const setModelOverride = (page: Page, modelOverride: Record<string, unknown>) =>
  page.evaluate(async (override) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("characters", "readwrite");
      const store = tx.objectStore("characters");
      const get = store.get(1);
      get.onsuccess = () => store.put({ ...get.result, modelOverride: override });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, modelOverride);

test("a reply's 'Show what was sent' opens the request behind it", async ({ page, mockAI }) => {
  mockAI.replyOnce("Aria twirls her pen thoughtfully.");
  await openChat(page, 1);
  await sendMessage(page, "What are you thinking about?");
  await expect(chatMessages(page).getByText("Aria twirls her pen thoughtfully.")).toBeVisible();
  await waitForReplyDone(page);

  const bubble = page.locator('[data-slot="message-bubble"]').filter({ hasText: "Aria twirls her pen thoughtfully." });
  if (await isTouch(page)) {
    await bubble.dispatchEvent("contextmenu");
    await page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem", { name: "Show what was sent" }).click();
  } else {
    await bubble.hover();
    await bubble.getByRole("button", { name: "Show what was sent" }).click();
  }
  const dialog = page.getByRole("dialog", { name: "What was sent" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Final prompt")).toContainText("What are you thinking about?");
  await expect(dialog.getByLabel("Reply")).toHaveText("Aria twirls her pen thoughtfully.");
});

test("a character's own model is the one the reply is requested from", async ({ page, mockAI }) => {
  mockAI.reply("Mock reply");
  await openChat(page, 1);
  await setModelOverride(page, { provider: "ollama", model: "aria-special-model", temperature: 1.3 });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await sendMessage(page, "Hi!");
  await expect(chatMessages(page).getByText("Mock reply")).toBeVisible();
  const sent = mockAI.requests.filter((r) => r.stream).pop()!;
  expect(sent.model).toBe("aria-special-model");
});
