import { test, expect, openChat, headerAction, sendMessage } from "./fixtures";

// The room seed adds Kai, so there is someone to invite into Aria's 1:1.
test.use({ seed: { room: true } });

test("invite a second character into a 1:1 chat to make it a group chat", async ({ page, mockAI }) => {
  await openChat(page, 1);
  await headerAction(page, "Invite someone");

  // The participants panel opens with an "Invite someone" button of its own.
  await page.getByRole("button", { name: "Invite someone", exact: true }).last().click();
  await page.getByRole("textbox", { name: "Search characters to invite" }).fill("Ka");
  await page.getByRole("button", { name: /^KA Kai/ }).click();

  // Inviting branches into a new group chat; the 1:1 stays as it was.
  await expect(page).not.toHaveURL(/#\/chat\/1$/);
  await expect(page).toHaveURL(/#\/chat\/\d+$/);
  const header = page.locator("header").first();
  await expect(header).toContainText("With Aria, Kai");
  await expect(page.getByLabel("Message input")).toBeVisible();

  // Both characters are now in the conversation the AI sees. (In a room the
  // app strips a leading "Name:" from replies, so the mock doesn't add one.)
  mockAI.reply("Fine, I'll help.");
  await sendMessage(page, "Can you both help me?");
  await expect(page.getByText("Fine, I'll help.").first()).toBeVisible();
  const prompt = mockAI.requests[0].messages.map((m) => m.content).join("\n");
  expect(prompt).toContain("Kai");
});
