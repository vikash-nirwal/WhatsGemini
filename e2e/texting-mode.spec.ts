import { test, expect, openChat, sendMessage, waitForReplyDone, messageBubble, headerAction } from "./fixtures";

// Texting mode (#6): a reply shows as separate texts, revealed one at a time,
// and your messages get read ticks. The stored message stays whole.

test.use({ seed: { messages: 3 }, localStorageOverrides: { texting_mode: "true" } });

const REPLY = "Hey you!\n\nHow did the interview go?\n\nTell me everything.";

test("a new reply arrives text by text, and the stored message stays whole", async ({ page, mockAI }) => {
  mockAI.reply(REPLY);
  await openChat(page);
  await sendMessage(page, "I'm back");

  const texts = page.locator('[data-slot="text-bubble"]');
  await expect(texts.first()).toHaveText("Hey you!");
  // The last text comes after the typing pauses, not all at once.
  await expect(messageBubble(page, "Tell me everything.")).toHaveCount(0);
  await expect(messageBubble(page, "Tell me everything.")).toBeVisible({ timeout: 10_000 });
  await expect(texts).toHaveText(["Hey you!", "How did the interview go?"]);
  await waitForReplyDone(page);

  // Your message was answered, so it shows as read.
  await expect(messageBubble(page, "I'm back").getByLabel("Read")).toBeVisible();

  // Stored whole: the next request carries the reply as one message.
  await sendMessage(page, "It went great");
  await expect.poll(() => mockAI.requests.length).toBe(2);
  expect(mockAI.requests[1].messages.some((m) => m.role === "assistant" && m.content === REPLY)).toBe(true);
});

test("replies already in the chat show whole when it opens", async ({ page, mockAI }) => {
  mockAI.reply(REPLY);
  await openChat(page);
  await sendMessage(page, "I'm back");
  await expect(messageBubble(page, "Tell me everything.")).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-slot="text-bubble"]')).toHaveCount(2);
  await expect(messageBubble(page, "Tell me everything.")).toBeVisible();
});

test.describe("per chat", () => {
  test.use({ localStorageOverrides: { texting_mode: "false" } });

  test("a chat can turn texting mode on while the app setting is off", async ({ page, mockAI }) => {
    mockAI.reply(REPLY);
    await openChat(page);
    await headerAction(page, "Scene & story");
    await page.getByRole("tab", { name: "Options", exact: true }).click();
    await expect(page.getByRole("button", { name: "App setting (off)" })).toBeVisible();
    await page.getByRole("button", { name: "On", exact: true }).click();
    await expect.poll(() =>
      page.evaluate(async () => {
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          const req = indexedDB.open("ChatAppDB");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const chat: any = await new Promise((resolve) => {
          const get = db.transaction("chats").objectStore("chats").get(1);
          get.onsuccess = () => resolve(get.result);
        });
        db.close();
        return chat.textingMode;
      })
    ).toBe(true);
    await page.getByRole("button", { name: "Close scene panel" }).click();

    await sendMessage(page, "I'm back");
    await expect(messageBubble(page, "Tell me everything.")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-slot="text-bubble"]')).toHaveCount(2);
  });
});
