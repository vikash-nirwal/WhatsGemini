import { test, expect, openRoute, openChat } from "./fixtures";

// The world pulse (#175): the last day's happenings at the top of Chats,
// folded to one line, each one tap from where it happened.

test.use({ seed: { messages: 2 } });

test("what happened today shows on the chat list and opens the timeline", async ({ page }) => {
  // Something happens: you make a change in god mode.
  await openChat(page);
  await page.getByRole("button", { name: "Composer options" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Toggle god mode" }).click();
  await page.getByLabel("Message input").fill("The harbour froze overnight");
  await page.getByLabel("Message input").press("Enter");
  await openRoute(page, "/");
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  const pulse = page.getByRole("region", { name: "World pulse" });
  await expect(pulse).toContainText("My world today · 1 new");
  await expect(pulse).toContainText("The harbour froze overnight");
  await pulse.getByRole("button", { expanded: false }).click();
  await expect(pulse).not.toContainText("new");
  await pulse.getByRole("link", { name: /The harbour froze overnight/ }).click();
  await expect(page.getByRole("list", { name: "World timeline" })).toContainText("The harbour froze overnight");
});
