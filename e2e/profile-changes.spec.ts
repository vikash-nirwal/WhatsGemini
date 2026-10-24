import { test, expect, openRoute, openChat, sendMessage, waitForReplyDone, chatMessages } from "./fixtures";

// Profile changes (#125): a character's About line, set in the editor, and
// changed by them every few days, with a notice in your chat.

test.use({ seed: { messages: 4 } });

test("a character changes their About line, and the chat shows it", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 9, 0, 0) });
  mockAI.reply((req) => (req.prompt.includes('is updating the "About" line') ? "Fixing things, mostly myself 🔧" : "Mock reply"));
  await openRoute(page, "/characters/1/edit");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next" }).click();
  const section = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Profile/ }) });
  await expect(async () => {
    if ((await section.getAttribute("open")) === null) await section.locator("summary").click();
    await expect(section).toHaveAttribute("open", "");
  }).toPass();
  await section.getByLabel("About line").fill("Grease and coffee");
  await section.getByRole("switch", { name: "Aria changes their profile" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await openChat(page);
  await page.clock.fastForward(30_000);
  await expect(chatMessages(page).getByText('Aria changed their About to "Fixing things, mostly myself 🔧"')).toBeVisible({ timeout: 15_000 });
  const ask = mockAI.requests.find((r) => r.prompt.includes('is updating the "About" line'))!.prompt;
  expect(ask).toContain('Their current About: "Grease and coffee"');

  await sendMessage(page, "hey");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("Aria's About line on their messaging profile right now: \"Fixing things, mostly myself 🔧\".");
});
