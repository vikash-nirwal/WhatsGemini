import { test, expect, openChat, sendMessage, waitForReplyDone, PHONE_REDESIGN_SKIP } from "./fixtures";

test.skip(({ isMobile }) => isMobile, PHONE_REDESIGN_SKIP);
test.use({ seed: { messages: 3 } });

test("Continue extends the last reply in place", async ({ page, mockAI }) => {
  mockAI.replyOnce("It was a dark and stormy", "night, and the wind howled.");
  await openChat(page, 1);

  await sendMessage(page, "Tell me a story.");
  await expect(page.getByText("It was a dark and stormy")).toBeVisible();
  await waitForReplyDone(page);

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // One message holding both parts, not a second reply.
  await expect(page.getByText("It was a dark and stormy night, and the wind howled.")).toBeVisible();
  await waitForReplyDone(page);
  expect(mockAI.requests).toHaveLength(2);
  expect(mockAI.requests[1].prompt).toBe("Continue.");
  await expect(page.getByText("night, and the wind howled.", { exact: true })).toHaveCount(0);
});
