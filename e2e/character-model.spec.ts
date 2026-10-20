import { test, expect, openRoute } from "./fixtures";

// #32: a character can pin its own provider and model. The section is
// collapsed by default and saved with the character.
test.use({ seed: { messages: 1 } });

// `reload` re-reads the character from IndexedDB: going to the same hash URL
// again wouldn't load the page at all.
const openEditor = async (page: import("@playwright/test").Page, { reload = false } = {}) => {
  if (reload) await page.reload();
  else await openRoute(page, "/characters/1/edit");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  return page.locator("details").filter({ has: page.locator("summary", { hasText: "Model for this character" }) });
};

test("pin a provider and model for one character, then reset it", async ({ page }) => {
  let section = await openEditor(page);
  await expect(section.locator("summary")).toContainText("same as app");
  await expect(section.getByRole("button", { name: "Anthropic (Claude)" })).toBeHidden();

  await section.locator("summary").click();
  await section.getByRole("button", { name: "Anthropic (Claude)" }).click();
  // No Anthropic key is saved in the test profile.
  await expect(section.getByText(/No API key saved for Anthropic/)).toBeVisible();
  await section.getByRole("combobox", { name: "Model" }).click();
  await page.getByRole("option", { name: "claude-haiku-4-5" }).click();
  await expect(section.locator("summary")).toContainText("Anthropic (Claude) / claude-haiku-4-5");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();

  section = await openEditor(page, { reload: true });
  await expect(section.locator("summary")).toContainText("Anthropic (Claude) / claude-haiku-4-5");

  await section.locator("summary").click();
  await section.getByRole("button", { name: "Reset to app settings" }).click();
  await expect(section.locator("summary")).toContainText("same as app");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();

  section = await openEditor(page, { reload: true });
  await expect(section.locator("summary")).toContainText("same as app");
});
