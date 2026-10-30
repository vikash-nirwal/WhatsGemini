import { test, expect, openChat, openRoute, sendMessage, chatMessages, openContactInfo, pickMenuItem } from "./fixtures";
import type { Page } from "@playwright/test";

// Character diary (#5): with the diary on, crossing the 30-message mark gets
// the character to write a private entry, readable from the Characters page
// and carried into its next prompt.

test.use({ seed: { messages: 28 } });

const chatAction = async (page: Page, name: string | RegExp) => {
  const direct = page.getByRole("button", { name });
  if (await direct.first().isVisible()) return direct.first().click();
  await page.getByRole("button", { name: "More options", exact: true }).last().click();
  await pickMenuItem(page, name);
};

const ENTRY = "Arin finally laughed at one of my jokes today. I pretended not to care.";

test("the character writes a diary entry you can read, and remembers it", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.stream ? "That's lovely to hear." : ENTRY));
  await openChat(page, 1);

  await openContactInfo(page);
  await page.getByRole("switch", { name: "Aria keeps a diary" }).click();
  await expect(page.getByRole("switch", { name: "Aria keeps a diary" })).toBeChecked();
  await page.getByRole("button", { name: "Close contact info" }).click();

  // Message 29 from you, 30 from Aria: the diary is due.
  await sendMessage(page, "Want to hear a joke?");
  await expect(chatMessages(page).getByText("That's lovely to hear.")).toBeVisible();
  await expect.poll(() => mockAI.requests.some((r) => !r.stream && r.prompt.includes("private diary entry"))).toBe(true);

  // The entry reaches the next reply's prompt.
  await sendMessage(page, "Another one?");
  await expect.poll(() => {
    const last = mockAI.requests.filter((r) => r.stream).pop();
    return last?.messages.some((m) => String(m.content).includes(ENTRY)) ?? false;
  }).toBe(true);

  // And it's readable from the Characters page.
  await openRoute(page, "/characters");
  await page.getByRole("button", { name: "More options for Aria" }).click();
  await page.getByRole("menuitem", { name: "Read diary" }).click();
  await expect(page.getByRole("dialog", { name: "Aria's diary" })).toBeVisible();
  await expect(page.getByText(ENTRY)).toBeVisible();
});
