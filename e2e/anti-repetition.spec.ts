import { test, expect, openChat, sendMessage } from "./fixtures";

// Anti-repetition guard (#19): the seeded replies all end "how was your
// day?", so the next request asks the model to say it differently.

test.use({ seed: { messages: 6 } });

test("a phrase recent replies keep reusing is flagged for the next reply", async ({ page, mockAI }) => {
  mockAI.reply("Something new entirely.");
  await openChat(page);
  await sendMessage(page, "Hello again");
  await expect.poll(() => mockAI.requests.length).toBe(1);
  expect(mockAI.requests[0].prompt).toContain("keep reusing these phrases");
  expect(mockAI.requests[0].prompt).toContain("how was your day");
});

test.describe("switched off", () => {
  test.use({ localStorageOverrides: { roleplay_style: JSON.stringify({ antiRepetition: false, arcSuggestions: false }) } });

  test("no note is sent", async ({ page, mockAI }) => {
    mockAI.reply("Fine.");
    await openChat(page);
    await sendMessage(page, "Hello again");
    await expect.poll(() => mockAI.requests.length).toBe(1);
    expect(mockAI.requests[0].prompt).not.toContain("keep reusing");
  });
});
