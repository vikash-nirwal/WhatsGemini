import { test, expect, openChat, sendMessage, waitForReplyDone, chatMessages } from "./fixtures";

// #31: every provider call is kept in memory, and Settings > Text can show
// the latest one. The log lives in memory only, so the test moves to the
// settings page with a hash change instead of a reload.
test.use({ seed: { messages: 3 } });

test("send a message, then inspect exactly what was sent and the reply", async ({ page, mockAI }) => {
  mockAI.replyOnce("Aria waves back from across the room.");
  await openChat(page, 1);
  await sendMessage(page, "Hello there, Aria!");
  await expect(chatMessages(page).getByText("Aria waves back from across the room.")).toBeVisible();
  await waitForReplyDone(page);

  await page.evaluate(() => {
    window.location.hash = "#/settings/text";
  });
  await page.getByRole("button", { name: "Show last request" }).click();

  const dialog = page.getByRole("dialog", { name: "What was sent" });
  await expect(dialog).toBeVisible();
  // The newest request is the chat turn: the character's system prompt by
  // section, the earlier messages, the user's message and the reply.
  const sections = dialog.getByRole("list", { name: "System prompt sections" }).getByRole("listitem");
  await expect(sections.first()).toBeVisible();
  await expect(dialog.getByRole("list", { name: "System prompt sections" })).toContainText("You are Aria: warm, witty and curious.");
  await expect(dialog.getByRole("list", { name: "History" })).toContainText("Aria message 1: how was your day?");
  await expect(dialog.getByLabel("Final prompt")).toContainText("Hello there, Aria!");
  await expect(dialog.getByLabel("Reply")).toHaveText("Aria waves back from across the room.");
  await expect(dialog).toContainText("ollama /");

  // A section expands to its full text.
  await sections.first().locator("summary").click();
  await expect(sections.first().locator("pre")).toBeVisible();

  // What the inspector shows is what reached the provider.
  const sent = mockAI.requests[mockAI.requests.length - 1];
  expect(sent.messages[0]).toMatchObject({ role: "system" });
  expect(sent.messages[0].content).toContain("You are Aria");
});

test("the inspector says so before anything was sent", async ({ page }) => {
  await page.goto("./#/settings/text");
  await page.getByRole("button", { name: "Show last request" }).click();
  await expect(page.getByRole("dialog", { name: "What was sent" })).toContainText("No requests yet");
});
