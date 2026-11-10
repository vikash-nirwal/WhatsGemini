import { test, expect, openChat, openRoute, headerAction, sendMessage, waitForReplyDone, messageBubble } from "./fixtures";

// Tools for characters (#266-#271): each kind of tool has its own switch in
// Settings, off until it's turned on; a [Use: ...] tag in a reply is run by
// the app and the character answers with the result.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";
const TOOLS_ON = JSON.stringify({ on: true, groups: { dice: true, facts: false, reminders: true, web: false, links: false }, reader: false });

test("tools are off until switched on in Settings", async ({ page, mockAI }) => {
  await openChat(page);
  await sendMessage(page, "Roll a d20 for me");
  await waitForReplyDone(page);
  expect(systemOf(mockAI.requests[0].messages)).not.toContain("[Use:");

  await openRoute(page, "/settings/tools");
  const switches = page.getByRole("switch");
  await expect(switches).toHaveCount(7);
  await expect(switches.nth(1)).toBeDisabled();
  await switches.nth(0).click();
  await switches.nth(1).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("character_tools") || "{}"))).toMatchObject({ on: true, groups: { dice: true, web: false } });
});

test.describe("with dice and reminders on", () => {
  test.use({ localStorageOverrides: { character_tools: TOOLS_ON } });

  test("a dice roll is run by the app and shown under the reply", async ({ page, mockAI }) => {
    mockAI.replyOnce("One sec, rolling.\n[Use: roll | 1d20]", "There it is. Not bad at all!");
    await openChat(page);
    await sendMessage(page, "Roll a d20 for me");
    await expect(messageBubble(page, "Not bad at all!")).toBeVisible();
    await waitForReplyDone(page);

    // Only the tools switched on are offered.
    const system = systemOf(mockAI.requests[0].messages);
    expect(system).toContain("[Use: roll |");
    expect(system).toContain("[Use: remind |");
    expect(system).not.toContain("[Use: search |");
    // The second call carries the real roll.
    expect(JSON.stringify(mockAI.requests[1].messages)).toMatch(/Tool result for roll \(1d20\): 1d20 rolled/);
    await expect(page.locator('[data-slot="tools-used"]')).toContainText(/Rolled 1d20: \d+/);
    await expect(page.getByText("[Use:")).toHaveCount(0);
    await expect(page.getByText("One sec, rolling.")).toHaveCount(0);
  });

  test("a reminder is kept on the chat", async ({ page, mockAI }) => {
    mockAI.replyOnce("[Use: remind | 20m | take the pasta off]", "Done, I'll text you in 20.");
    await openChat(page);
    await sendMessage(page, "Remind me in 20 minutes to take the pasta off");
    await expect(messageBubble(page, "I'll text you in 20")).toBeVisible();
    await waitForReplyDone(page);
    await expect(page.locator('[data-slot="tools-used"]')).toContainText("Reminder in 20 minutes: take the pasta off");
  });
});

test("Truth or Dare: a round is three replies, and the character waits for the pick", async ({ page, mockAI }) => {
  mockAI.reply("Okay, let's play. Truth or dare?");
  await openChat(page);
  await headerAction(page, "Play a game");
  await page.getByRole("dialog", { name: "Play a game" }).getByRole("button", { name: "Play Truth or Dare" }).click();
  await expect(messageBubble(page, "Truth or dare?")).toBeVisible();
  expect(JSON.stringify(mockAI.requests[0].messages)).toContain('ask them \\"Truth or dare?\\"');
  const strip = page.getByRole("region", { name: "Game" });
  await expect(strip).toContainText("Round 1");
  await waitForReplyDone(page);

  const steps = ["the user has just picked truth or dare", "the user has just answered their truth or done their dare", "the user has just given you your truth or dare"];
  for (let i = 0; i < 3; i++) {
    mockAI.reply(`Step reply ${i}`);
    await sendMessage(page, `My move ${i}`);
    await expect(messageBubble(page, `Step reply ${i}`)).toBeVisible();
    await waitForReplyDone(page);
    expect(systemOf(mockAI.requests[i + 1].messages)).toContain(steps[i]);
    await expect(strip).toContainText(i < 2 ? "Round 1" : "Round 2");
  }
});
