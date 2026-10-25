import { test, expect, openChat, sendMessage, waitForReplyDone, headerAction } from "./fixtures";

// Mood-tinted chat (#90): the background takes a soft colour from the mood.

test.use({ seed: { messages: 4 } });

test("the chat takes the colour of the character's latest mood", async ({ page, mockAI }) => {
  mockAI.reply("[Emotion: sad] I really missed you today.");
  await openChat(page);
  await expect(page.locator('[data-slot="mood-tint"]')).toHaveCount(0);
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: "Options", exact: true }).click();
  await page.getByRole("switch", { name: "Tint the chat with the mood" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await sendMessage(page, "Hey, how are you?");
  await waitForReplyDone(page);
  const tint = page.locator('[data-slot="mood-tint"]');
  await expect(tint).toHaveAttribute("data-mood", "sad");
  await expect.poll(() => tint.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/rgba?\(90,? 130,? 220/);
});
