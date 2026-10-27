import { test, expect, openChat, sendMessage, waitForReplyDone, messageBubble, openContactInfo } from "./fixtures";

// Blocking, both ways (#133).

test.use({ seed: { messages: 3 } });

test("you can block someone from Contact info, and unblock them", async ({ page }) => {
  await openChat(page);
  await openContactInfo(page);
  await page.getByRole("button", { name: "Block Aria" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("button", { name: "Close contact info" }).click();
  await expect(page.getByText("You blocked Aria", { exact: true })).toBeVisible();
  const bar = page.locator('[data-slot="blocked-bar"]');
  await expect(bar).toContainText("You blocked Aria. They can't message you");
  await expect(page.getByLabel("Message input")).toHaveCount(0);
  await expect(page.locator("header").first()).toContainText("Blocked");

  await bar.getByRole("button", { name: "Unblock" }).click();
  await expect(page.getByLabel("Message input")).toBeVisible();
  await expect(page.getByRole("region", { name: "Messages" }).getByText("You unblocked Aria")).toBeVisible();
});

test("a character can block you in a fight: no replies, one grey tick", async ({ page, mockAI }) => {
  mockAI.replyOnce("That's it. I'm done with you.\n[Block]");
  await openChat(page);
  await sendMessage(page, "You're nothing to me");
  await waitForReplyDone(page);
  await expect(page.getByRole("region", { name: "Messages" }).getByText("Aria blocked you")).toBeVisible();
  await expect(page.getByText("[Block]")).toHaveCount(0);

  await sendMessage(page, "Wait, I'm sorry");
  await expect(messageBubble(page, "Wait, I'm sorry").getByLabel("Sent")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(mockAI.requests.filter((r) => r.stream)).toHaveLength(1);
});
