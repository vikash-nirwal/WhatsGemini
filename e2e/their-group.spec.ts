import { test, expect, openRoute, chatMessages } from "./fixtures";

// A group of theirs (#202): you make a group for characters and you're not
// in it. You read along; they talk on their own (or when you ask), up to the
// group's message limit.

test.use({ seed: { messages: 2, room: true } });

test("a group of theirs talks without you, within its limit", async ({ page, mockAI }) => {
  mockAI.reply((req) =>
    req.prompt.includes("isn't in it.") ? "Aria: you coming tonight?\nKai: depends who's cooking\nAria: me\nKai: then no\nAria: rude\nKai: kidding" : "Mock reply"
  );
  await openRoute(page, "/");
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "New chat" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Group/ }).click();
  await dialog.getByRole("button", { name: /Aria/ }).first().click();
  await dialog.getByRole("button", { name: /Kai/ }).first().click();
  await dialog.getByLabel("Room name").fill("Garage crew");
  await dialog.getByRole("checkbox", { name: "Just them, you're not in it" }).check();
  await dialog.getByLabel("Messages each time they talk").selectOption("4");
  await dialog.getByRole("button", { name: /Create Room/ }).click();

  await expect(page).toHaveURL(/#\/chat\/\d+$/);
  await expect(page.locator('[data-slot="their-group-bar"]')).toContainText("You're not in this group.");
  await expect(page.getByLabel("Message input")).toHaveCount(0);
  await page.getByRole("button", { name: "Let them talk now" }).click();
  await expect(chatMessages(page).getByText("then no")).toBeVisible();
  // Four messages at most.
  await expect(chatMessages(page).getByText("rude")).toHaveCount(0);
});
