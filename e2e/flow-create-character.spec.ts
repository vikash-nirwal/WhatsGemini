import { test, expect, openRoute, sendMessage, chatMessages, editorStep } from "./fixtures";

// An empty database, so the new character is the only one in the gallery.
test.use({ seed: false });

test("create a character in the editor and start a chat with it", async ({ page, mockAI }) => {
  mockAI.replyOnce("Ahoy! Nell here, glad you came by.");
  await openRoute(page, "/characters/new");

  // Step 1, Who they are: a name is the only requirement.
  const name = page.getByRole("textbox", { name: "Character Name" });
  await expect(name).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Give this character a name first.")).toBeVisible();
  await name.fill("Nell the Navigator");
  await page.getByRole("textbox", { name: "Description (Optional)" }).fill("A cheerful map-maker.");
  await editorStep(page, "Personality");

  // Step 3, Personality: the prompt is required.
  await page.getByRole("textbox", { name: "Character Prompt (Personality, Style, etc.)" }).fill("You are Nell, a cheerful map-maker who loves puns.");
  // The rest is optional.
  await editorStep(page, "Test and finish");
  await page.getByRole("button", { name: "Create Character" }).click();

  // Back in the gallery, the new card opens a 1:1 chat.
  await expect(page).toHaveURL(/#\/characters$/);
  await expect(page.getByText("Nell the Navigator", { exact: true }).locator("visible=true").first()).toBeVisible();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page).toHaveURL(/#\/chat\/\d+$/);
  await expect(page.getByLabel("Message input")).toBeVisible();
  await expect(page.locator("header").first()).toContainText("Nell the Navigator");

  await sendMessage(page, "Hello Nell!");
  await expect(chatMessages(page).getByText("Ahoy! Nell here, glad you came by.")).toBeVisible();
  // The character's own prompt drove the reply.
  const system = mockAI.requests[0].messages.map((m) => m.content).join("\n");
  expect(system).toContain("cheerful map-maker who loves puns");
});
