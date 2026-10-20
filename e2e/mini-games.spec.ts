import { test, expect, openChat, headerAction, sendMessage, waitForReplyDone, messageBubble } from "./fixtures";

// Mini-games (#52): a game is started from the chat menu, its rules go to
// the model while it's on, and a [Game over] tag ends it with a score.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

test("Would You Rather: started, played a round, and won", async ({ page, mockAI }) => {
  mockAI.reply("Ooh, okay. Would you rather always be cold or always be hot?");
  await openChat(page);
  await headerAction(page, "Play a game");
  await page.getByRole("dialog", { name: "Play a game" }).getByRole("button", { name: "Play Would You Rather" }).click();

  await expect(messageBubble(page, "always be cold or always be hot")).toBeVisible();
  expect(JSON.stringify(mockAI.requests[0].messages)).toContain('ask the first \\"Would you rather\\" question');
  const strip = page.getByRole("region", { name: "Game" });
  await expect(strip).toContainText("Would You Rather · Round 1");
  await waitForReplyDone(page);

  mockAI.reply("Cold! Same. Okay, next one...");
  await sendMessage(page, "Cold, I can always add layers");
  await expect(strip).toContainText("Round 2");
  expect(systemOf(mockAI.requests[1].messages)).toContain("You're playing Would You Rather with the user, in character. Round 1.");
  await waitForReplyDone(page);

  mockAI.reply("Okay, you win this one, you're too good at this.\n[Game over: user wins]");
  await sendMessage(page, "I'm done, that was fun");
  await expect(messageBubble(page, "you're too good at this")).toBeVisible();
  await expect(messageBubble(page, "you're too good at this")).not.toContainText("[Game over");
  await expect(page.getByText("You won Would You Rather!")).toBeVisible();
  await expect(strip).toHaveCount(0);
});

test("20 Questions: the character can be the one guessing, and the game can be ended", async ({ page, mockAI }) => {
  mockAI.reply("Got it, you've picked something. Is it alive?");
  await openChat(page);
  await headerAction(page, "Play a game");
  const dialog = page.getByRole("dialog", { name: "Play a game" });
  await dialog.getByRole("button", { name: "I think, Aria guesses" }).click();
  await dialog.getByRole("button", { name: "Play 20 Questions" }).click();

  await expect(messageBubble(page, "Is it alive?")).toBeVisible();
  expect(JSON.stringify(mockAI.requests[0].messages)).toContain("you have to guess it");
  const strip = page.getByRole("region", { name: "Game" });
  await expect(strip).toContainText("Aria is guessing · Question 1 of 20");
  await waitForReplyDone(page);
  await strip.getByRole("button", { name: "End game" }).click();
  await expect(strip).toHaveCount(0);
});
