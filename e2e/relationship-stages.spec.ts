import { test, expect, openChat, sendMessage, waitForReplyDone, headerAction } from "./fixtures";

// Relationship stages (#70): an opt-in ladder; the stage goes in the
// prompt, and a check every 20 messages may suggest the next step.

test.use({ seed: { messages: 20 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

test("the stage shapes replies, and moving on is suggested and accepted", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.includes("Their relationship is at the stage") ? "NEXT" : "*She smiles.* You again."));
  await openChat(page);
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: "Story", exact: true }).click();
  await page.getByRole("switch", { name: "Relationship stage" }).click();
  const ladder = page.getByRole("list", { name: "Relationship stages" });
  await ladder.getByRole("button", { name: "Flirting" }).click();
  await expect(ladder.getByRole("button", { name: "Flirting" })).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await sendMessage(page, "Fancy seeing you here.");
  await waitForReplyDone(page);
  expect(systemOf(mockAI.requests[0].messages)).toContain("Where things stand between you and the user: Flirting.");

  const card = page.getByRole("region", { name: "Relationship stage" });
  await expect(card).toContainText("Dating");
  await card.getByRole("button", { name: "Move on" }).click();
  await expect(card).toHaveCount(0);

  await sendMessage(page, "So, dinner on Friday?");
  await expect.poll(() => systemOf(mockAI.requests.filter((r) => r.stream).pop()?.messages || [])).toContain(": Dating.");
});
