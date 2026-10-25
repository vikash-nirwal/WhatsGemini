import { test, expect, openChat, sendMessage, messageBubble, waitForReplyDone, PHONE_REDESIGN_SKIP, chatMessages, messageAction } from "./fixtures";

test.skip(({ isMobile }) => isMobile, PHONE_REDESIGN_SKIP);
test.use({ seed: { messages: 3 } });

test("Continue extends the last reply in place", async ({ page, mockAI }) => {
  mockAI.replyOnce("It was a dark and stormy", "night, and the wind howled.");
  await openChat(page, 1);

  await sendMessage(page, "Tell me a story.");
  await expect(chatMessages(page).getByText("It was a dark and stormy")).toBeVisible();
  await waitForReplyDone(page);

  const reply = messageBubble(page, "It was a dark and stormy");
  await reply.hover();
  await messageAction(page, reply, "Continue", { exact: true });
  // One message holding both parts, not a second reply.
  await expect(chatMessages(page).getByText("It was a dark and stormy night, and the wind howled.")).toBeVisible();
  await waitForReplyDone(page);
  expect(mockAI.requests).toHaveLength(2);
  // "Continue." comes first; notes for the model (like #19's repetition
  // warning) may follow it.
  expect(mockAI.requests[1].prompt).toMatch(/^Continue\.(\n|$)/);
  await expect(chatMessages(page).getByText("night, and the wind howled.", { exact: true })).toHaveCount(0);
});
