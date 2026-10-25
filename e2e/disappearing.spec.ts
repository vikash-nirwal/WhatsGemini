import { test, expect, openChat, headerAction, sendMessage, waitForReplyDone, messageBubble } from "./fixtures";

// Disappearing messages (#136): turned on per chat in Scene & story >
// Options; new messages get a timer mark, the character is told, and a
// message past its day is gone.

test.use({ seed: { messages: 3 } });

test("disappearing messages: on, marked, told, and gone after a day", async ({ page, mockAI }) => {
  await page.clock.install();
  mockAI.reply("Off the record? Sure.");
  await openChat(page);
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: "Options", exact: true }).click();
  await page.getByRole("group", { name: "Disappearing messages" }).getByRole("button", { name: "1 day" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();
  await expect(page.getByText(/You turned on disappearing messages/)).toBeVisible();
  await expect(page.locator("header").first()).toContainText("Disappearing · 1 day");

  await sendMessage(page, "Can I tell you something?");
  await waitForReplyDone(page);
  await expect(messageBubble(page, "Can I tell you something?").getByRole("img", { name: /Disappears 1 day/ })).toBeVisible();
  expect(JSON.stringify(mockAI.requests[0].messages)).toContain("Disappearing messages are on in this chat");

  // A day later the new messages are gone; the older ones and the notice stay.
  await page.clock.fastForward(25 * 60 * 60 * 1000);
  await expect(messageBubble(page, "Can I tell you something?")).toHaveCount(0, { timeout: 15_000 });
  await expect(messageBubble(page, "Off the record? Sure.")).toHaveCount(0);
  await expect(page.getByText(/You turned on disappearing messages/)).toBeVisible();
  await expect(page.getByText("Aria message 1: how was your day?")).toBeVisible();
});
