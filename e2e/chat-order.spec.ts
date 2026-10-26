import { test, expect, openChat, sendMessage, waitForReplyDone } from "./fixtures";

// The chat list is ordered like a messaging app's: the chat you last talked
// in goes to the top.

test.use({ seed: { messages: 3, room: true } });

test("the chat you last talked in moves to the top", async ({ page, mockAI }) => {
  mockAI.reply("Mock reply");
  await openChat(page, 2);
  await sendMessage(page, "hey both");
  await waitForReplyDone(page);
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  const rows = page.getByRole("complementary", { name: "Sidebar" }).getByRole("link");
  await expect(rows.first()).toContainText("Aria & Kai");

  await openChat(page, 1);
  await sendMessage(page, "just you now");
  await waitForReplyDone(page);
  if (await menu.isVisible()) await menu.click();
  await expect(rows.first()).toContainText("Aria");
  await expect(rows.first()).not.toContainText("Aria & Kai");
});
