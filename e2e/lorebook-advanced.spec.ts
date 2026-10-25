import { editorStep } from "./fixtures";
import { Page } from "@playwright/test";
import { test, expect, openRoute, openChat, sendMessage, waitForReplyDone } from "./fixtures";

// #29: a lore entry's Advanced settings (priority, chance, look back, stay
// active, second keywords) are edited in the character editor, survive a
// reload, and actually gate the lore in a chat.

const LORE = "The Ember Blade burns with a fire that never goes out.";

const openLorebookStep = async (page: Page) => {
  await openRoute(page, "/characters/1/edit");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  await editorStep(page, "Advanced");
  await expect(page.getByRole("heading", { name: /Lorebook/ })).toBeVisible();
};

const addSwordEntry = async (page: Page) => {
  await page.getByRole("button", { name: "Add Lore Entry" }).click();
  const keyword = page.getByPlaceholder("Add a keyword...");
  await keyword.fill("sword");
  await keyword.press("Enter");
  await page.getByPlaceholder(/Lore content injected/).fill(LORE);
};

const advanced = (page: Page) => page.locator("summary", { hasText: "Advanced" });

const addSecondKeyword = async (page: Page, word: string) => {
  await page.getByRole("switch", { name: "Also needs a second keyword" }).click();
  const second = page.getByPlaceholder("Add a second keyword...");
  await second.fill(word);
  await second.press("Enter");
};

const save = async (page: Page) => {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();
};

test("advanced lore settings are saved and survive a reload", async ({ page }) => {
  await openLorebookStep(page);
  await addSwordEntry(page);

  // Collapsed until opened, so the plain editor stays simple.
  await expect(page.getByRole("spinbutton", { name: "Priority" })).toBeHidden();
  await advanced(page).click();
  await page.getByRole("spinbutton", { name: "Priority" }).fill("5");
  await page.getByRole("spinbutton", { name: "Chance to trigger" }).fill("40");
  await page.getByRole("spinbutton", { name: "Look back" }).fill("3");
  await page.getByRole("spinbutton", { name: "Stay active for" }).fill("2");
  await addSecondKeyword(page, "fire");
  await page.getByRole("combobox", { name: "Trigger when the second keywords are" }).click();
  await page.getByRole("option", { name: "All of them mentioned", exact: true }).click();
  await save(page);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  await editorStep(page, "Advanced");
  // The collapsed summary says something is set before it's opened.
  await expect(advanced(page)).toContainText("5 settings changed");
  await advanced(page).click();
  await expect(page.getByRole("spinbutton", { name: "Priority" })).toHaveValue("5");
  await expect(page.getByRole("spinbutton", { name: "Chance to trigger" })).toHaveValue("40");
  await expect(page.getByRole("spinbutton", { name: "Look back" })).toHaveValue("3");
  await expect(page.getByRole("spinbutton", { name: "Stay active for" })).toHaveValue("2");
  await expect(page.getByRole("switch", { name: "Also needs a second keyword" })).toBeChecked();
  await expect(page.getByText("fire", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Trigger when the second keywords are" })).toContainText("All of them mentioned");

  // Clearing a box goes back to the default rather than saving 0.
  await page.getByRole("spinbutton", { name: "Chance to trigger" }).fill("");
  await save(page);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  await editorStep(page, "Advanced");
  await expect(advanced(page)).toContainText("4 settings changed");
});

test("a second keyword keeps the lore out until both words come up in the chat", async ({ page, mockAI }) => {
  await openLorebookStep(page);
  await addSwordEntry(page);
  await advanced(page).click();
  await addSecondKeyword(page, "fire");
  await save(page);

  // The whole request for the turn that sent `text` (the lore lands in its
  // system prompt). Polled: right after sending, the reply may not have
  // started yet, so "no reply in progress" alone doesn't mean it was sent.
  const requestFor = async (text: string) => {
    await expect.poll(() => mockAI.requests.some((r) => r.prompt.includes(text)), { message: `a request for "${text}"` }).toBe(true);
    return mockAI.requests.find((r) => r.prompt.includes(text))!.messages.map((m) => m.content).join("\n");
  };
  await openChat(page);
  await sendMessage(page, "Show me your sword.");
  await waitForReplyDone(page);
  expect(await requestFor("Show me your sword.")).not.toContain(LORE);

  await sendMessage(page, "Does the sword really hold fire?");
  await waitForReplyDone(page);
  expect(await requestFor("Does the sword really hold fire?")).toContain(LORE);
});
