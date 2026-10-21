import { test, expect, openChat, headerAction, messageBubble } from "./fixtures";
import { installSpeechFakes, say, spoken } from "./speechFakes";

// Phone calls (#56): listen, send after a pause, speak the reply, listen
// again. Speech is faked (see speechFakes.ts).

test.use({ seed: { messages: 3 } });

test("a call listens, sends what was said, speaks the reply and listens again", async ({ page, mockAI }) => {
  await installSpeechFakes(page);
  mockAI.reply("Hey you! I'm good, just got home.");
  await openChat(page);
  await headerAction(page, "Call Aria");

  const callScreen = page.getByRole("dialog", { name: "Call with Aria" });
  await expect(callScreen).toBeVisible();
  const status = callScreen.getByRole("status");
  await expect(status).toHaveText("Listening...");

  await expect.poll(() => say(page, "Hi Aria, how are you?")).toBe(true);
  // After a short pause the words are sent.
  await expect.poll(() => mockAI.requests.length, { timeout: 10_000 }).toBe(1);
  expect(mockAI.requests[0].prompt).toContain("Hi Aria, how are you?");
  expect(JSON.stringify(mockAI.requests[0].messages)).toContain("You're on a voice call with the user right now");

  // The reply is spoken in the character's voice, then the line is open again.
  await expect.poll(async () => (await spoken(page)).map((s) => s.text).join(" ")).toContain("I'm good, just got home.");
  await expect(status).toHaveText("Aria is talking");
  await page.evaluate(() => (window as any).__speech.finish());
  await expect(status).toHaveText("Listening...");

  // Muting stops listening until unmuted.
  await callScreen.getByRole("button", { name: "Mute" }).click();
  await expect(status).toHaveText("You're muted");
  await callScreen.getByRole("button", { name: "Unmute" }).click();
  await expect(status).toHaveText("Listening...");

  await callScreen.getByRole("button", { name: "End call" }).click();
  await expect(callScreen).toBeHidden();
  await expect(page.getByText(/Call ended · \d+:\d\d/)).toBeVisible();
  // The call is in the chat as voice messages.
  await expect(messageBubble(page, "I'm good, just got home.")).toHaveCount(1);
});

test("there's no Call action where the browser can't listen", async ({ page }) => {
  await installSpeechFakes(page, { recognition: false });
  await openChat(page);
  await page.getByRole("button", { name: "More options" }).locator("visible=true").click();
  await expect(page.getByRole("menuitem", { name: "Call Aria" })).toHaveCount(0);
});
