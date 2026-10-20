import { test, expect, openChat, sendMessage, messageBubble, waitForReplyDone, PHONE_REDESIGN_SKIP } from "./fixtures";

test.skip(({ isMobile }) => isMobile, PHONE_REDESIGN_SKIP);
test.use({ seed: { messages: 3 } });

test("edit your last message and get a new reply to it", async ({ page, mockAI }) => {
  mockAI.replyOnce("Coffee is the answer.", "Tea it is, then.");
  await openChat(page, 1);

  await sendMessage(page, "Coffee or tea?");
  await expect(page.getByText("Coffee is the answer.")).toBeVisible();
  await waitForReplyDone(page);

  const bubble = messageBubble(page, "Coffee or tea?");
  await bubble.hover();
  await bubble.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Message" });
  await expect(dialog).toBeVisible();
  const box = dialog.getByRole("textbox");
  await expect(box).toHaveValue("Coffee or tea?");
  await box.fill("Tea or coffee? Pick tea.");
  await dialog.getByRole("button", { name: "Save Changes" }).click();
  await expect(dialog).toBeHidden();

  // The edited message replaces the old one and gets its own reply.
  await expect(page.getByText("Tea or coffee? Pick tea.")).toBeVisible();
  await expect(page.getByText("Tea it is, then.")).toBeVisible();
  await expect(page.getByText("Coffee or tea?", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Coffee is the answer.")).toHaveCount(0);
  expect(mockAI.requests).toHaveLength(2);
  expect(mockAI.requests[1].prompt).toContain("Tea or coffee? Pick tea.");
  // The original is kept as an earlier variant of the message.
  await expect(messageBubble(page, "Tea or coffee? Pick tea.").getByText("2/2")).toBeVisible();
});
