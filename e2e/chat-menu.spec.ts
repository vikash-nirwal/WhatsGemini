import { test, expect, openChat, messageBubble } from "./fixtures";

// The chat's menu in sections (the user's ask, 2026-10-30: some thirty items
// in one list), and a follow-up from the composer's "+" menu too.

test.use({ seed: { messages: 6 } });

test("the chat menu is grouped, and the rarer items sit in submenus", async ({ page }) => {
  await openChat(page);
  await page.locator("header").first().getByRole("button", { name: "More options" }).locator("visible=true").click();
  // Everyday items at the top, the rest by what they're for.
  await expect(page.getByRole("menuitem", { name: "Make Aria send a follow-up now" })).toBeVisible();
  for (const section of ["Story moments", "Play together", "Chapters and history", "Save and share"]) {
    await expect(page.getByRole("menuitem", { name: section })).toBeVisible();
  }
  await expect(page.getByRole("menuitem", { name: "Export chat (backup file)" })).toBeHidden();
  await page.getByRole("menuitem", { name: "Save and share" }).click();
  await expect(page.getByRole("menuitem", { name: "Export chat (backup file)" })).toBeVisible();
  // Fewer things at the top level than the thirty-odd there were.
  const top = page.getByRole("menu").first().locator(':scope > [role="menuitem"]');
  expect(await top.count()).toBeLessThanOrEqual(16);
});

test("the composer's + menu asks for a follow-up", async ({ page, mockAI }) => {
  mockAI.reply("also, one more thing");
  await openChat(page);
  await page.getByRole("button", { name: "Composer options" }).locator("visible=true").click();
  await page.getByRole("menuitemcheckbox", { name: "Aria sends a follow-up" }).click();
  await expect(messageBubble(page, "also, one more thing")).toBeVisible({ timeout: 15_000 });
});
