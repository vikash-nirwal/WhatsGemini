import { test, expect, openChat, sendMessage, waitForReplyDone, headerAction } from "./fixtures";

// Event invites (#134): a reply ending in [Invite: ...] shows a card;
// accepting makes it a shared plan, and the answer reaches the next reply.

test.use({ seed: { messages: 3 } });

test("an invite card can be accepted, and becomes a plan", async ({ page, mockAI }) => {
  mockAI.replyOnce("You have to come!\n[Invite: Jazz at Hot Clube | Friday 22:00 | Praça da Alegria]", "Yay, see you there.");
  await openChat(page);
  await sendMessage(page, "Doing anything fun?");
  await waitForReplyDone(page);
  const card = page.getByRole("group", { name: "Invite: Jazz at Hot Clube" });
  await expect(card).toContainText("Friday 22:00 · Praça da Alegria");
  await expect(page.getByText("[Invite:")).toHaveCount(0);
  await card.getByRole("button", { name: "Accept" }).click();
  await expect(card).toContainText("You're going");
  await expect(page.getByText(/Added to Story › Plans together: Jazz at Hot Clube/)).toBeVisible();

  await sendMessage(page, "Can't wait");
  await waitForReplyDone(page);
  expect(JSON.stringify(mockAI.requests[1].messages)).toContain("accepted Aria's invite to Jazz at Hot Clube");

  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: "Story", exact: true }).click();
  await expect(page.getByText("Jazz at Hot Clube").last()).toBeVisible();
});
