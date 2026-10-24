import { test, expect, openChat, sendMessage, headerAction } from "./fixtures";

// Letters (#61): after a few days away, a character with letters on writes
// one; it shows in the chat, can be answered, and the next reply knows it.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";
const LETTER = "Dear friend,\nThe cafe has been quiet without you. I kept your window seat free all week.\n\nAria";

test("a letter arrives after an absence, and can be replied to", async ({ page, mockAI }) => {
  await page.clock.install();
  mockAI.reply((req) => (req.prompt.includes("hasn't written in") ? LETTER : "I'm so glad you wrote back."));
  await openChat(page);
  await headerAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page.getByRole("switch", { name: "Aria writes letters" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();
  // The seeded chat was last used months ago.
  await page.clock.fastForward(30_000);

  const envelope = page.getByText("A letter from Aria");
  await expect(envelope).toBeVisible({ timeout: 15_000 });
  await envelope.click();
  await expect(page.getByText("I kept your window seat free all week.")).toBeVisible();
  // The letter's own Reply (the messages have icon-only Reply buttons too, #119).
  await page.getByRole("button", { name: "Reply", exact: true }).filter({ hasText: "Reply" }).click();
  await expect(page.getByLabel("Message input")).toHaveValue('(Replying to your letter: "Dear friend,") ');

  await sendMessage(page, "Sorry I've been away, I missed you too.");
  await expect.poll(() => systemOf(mockAI.requests.filter((r) => r.stream).pop()?.messages || [])).toContain("you wrote them this letter");
});
