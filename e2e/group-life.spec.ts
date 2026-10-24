import { test, expect, openChat, headerAction, sendMessage, waitForReplyDone, chatMessages } from "./fixtures";

// Group events and polls (#124): renaming a group (by you or a member),
// "You removed", and polls the members vote in.

test.use({ seed: { messages: 4, room: true } });

test("a poll you create gets the members' votes, and yours", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 18, 0, 0) });
  mockAI.reply((req) => (req.prompt.includes("A poll was posted") ? '[{"name": "Aria", "option": 1}, {"name": "Kai", "option": 2}]' : "Mock reply"));
  await openChat(page, 2);
  await headerAction(page, "Create poll");
  const dialog = page.getByRole("dialog", { name: "Create poll" });
  await dialog.getByLabel("Poll question").fill("Pizza or tacos?");
  await dialog.getByLabel("Option 1").fill("Pizza");
  await dialog.getByLabel("Option 2").fill("Tacos");
  await dialog.getByRole("button", { name: "Send poll" }).click();
  const poll = page.getByRole("group", { name: "Poll: Pizza or tacos?" });
  await expect(poll).toBeVisible();
  await expect.poll(() => mockAI.requests.filter((r) => r.prompt.includes("A poll was posted")).length).toBe(1);
  expect(mockAI.requests.find((r) => r.prompt.includes("A poll was posted"))!.prompt).toContain("- Aria:");

  // The votes come in over the next minute and a half.
  await page.clock.fastForward(2 * 60_000);
  await expect(poll.getByRole("button", { name: "Pizza, 1 vote" })).toBeVisible();
  await expect(poll.getByRole("button", { name: "Tacos, 1 vote" })).toContainText("Kai");
  await poll.getByRole("button", { name: "Tacos, 1 vote" }).click();
  await expect(poll.getByRole("button", { name: "Tacos, 2 votes" })).toHaveAttribute("aria-pressed", "true");
});

test("a member can rename the group, and so can you", async ({ page, mockAI }) => {
  mockAI.reply("Fine, it's official now.\n[Group name: Garage Gremlins]");
  await openChat(page, 2);
  await sendMessage(page, "We need a better name.");
  await waitForReplyDone(page);
  await expect(chatMessages(page).getByText(/changed the group name to "Garage Gremlins"/)).toBeVisible();
  await expect(chatMessages(page).getByText("Fine, it's official now.")).toBeVisible();
  await expect(chatMessages(page)).not.toContainText("[Group name");

  await headerAction(page, "Participants");
  await page.getByLabel("Group name").fill("Night Shift");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(chatMessages(page).getByText('You changed the group name to "Night Shift"')).toBeVisible();
  await page.getByRole("button", { name: "Remove Kai from this chat" }).click();
  await expect(chatMessages(page).getByText("You removed Kai")).toBeVisible();
});
