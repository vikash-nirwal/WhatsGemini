import { test, expect, openChat, sendMessage } from "./fixtures";

// "Previously on..." (#46): the seeded chat's last message is months old, so
// opening it shows a recap, written once and kept on the chat.

test.use({ seed: { messages: 6 }, localStorageOverrides: { recap_after_days: "3" } });

const RECAP = "You told Aria about your day, and she was glad it went fine.";

test("an old chat opens with a recap that's written once, kept, and never sent to the AI", async ({ page, mockAI }) => {
  mockAI.reply(RECAP);
  await openChat(page);

  const card = page.getByRole("region", { name: "Previously on" });
  await expect(card).toContainText(RECAP);
  expect(mockAI.requests).toHaveLength(1);
  expect(mockAI.requests[0].prompt).toContain('Write a short "Previously on..." recap');

  // Reopening reuses the saved recap.
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(RECAP);
  // Give a mistaken second recap request time to show up.
  await page.waitForTimeout(500);
  expect(mockAI.requests).toHaveLength(1);

  // A new message moves the story on: the card goes, and the recap isn't in the prompt.
  mockAI.reply("Welcome back!");
  await sendMessage(page, "I'm back");
  await expect(card).toHaveCount(0);
  await expect.poll(() => mockAI.requests.length).toBe(2);
  expect(JSON.stringify(mockAI.requests[1].messages)).not.toContain(RECAP);
});

test("a dismissed recap stays dismissed", async ({ page, mockAI }) => {
  mockAI.reply(RECAP);
  await openChat(page);
  const card = page.getByRole("region", { name: "Previously on" });
  await expect(card).toContainText(RECAP);
  await card.getByRole("button", { name: "Dismiss recap" }).click();
  await expect(card).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await expect(card).toHaveCount(0);
  expect(mockAI.requests).toHaveLength(1);
});

test("a failed recap can be retried", async ({ page, mockAI }) => {
  // An empty reply counts as a failure.
  mockAI.replyOnce("   ");
  mockAI.reply(RECAP);
  await openChat(page);
  const card = page.getByRole("region", { name: "Previously on" });
  await card.getByRole("button", { name: "Try again" }).click();
  await expect(card).toContainText(RECAP);
});
