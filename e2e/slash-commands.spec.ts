import { test, expect, openChat, chatMessages } from "./fixtures";

// Composer slash commands (#14).

test.use({ seed: { messages: 4 } });

const send = async (page: import("@playwright/test").Page, text: string) => {
  await page.getByLabel("Message input").fill(text);
  await page.getByRole("button", { name: "Send Message" }).click();
};

test("typing / lists the commands", async ({ page }) => {
  await openChat(page, 1);
  await page.getByLabel("Message input").fill("/ti");
  const list = page.getByRole("listbox", { name: "Commands" });
  await expect(list.getByText("/timeskip 3 hours")).toBeVisible();
  await list.getByRole("option").first().click();
  await expect(page.getByLabel("Message input")).toHaveValue("/timeskip ");
});

test("/roll sends the action with a real dice result the AI must respect", async ({ page, mockAI }) => {
  mockAI.reply("The lock clicks open.");
  await openChat(page, 1);
  await send(page, "/roll 1d20 I try to pick the lock");
  await expect(chatMessages(page).getByText("The lock clicks open.")).toBeVisible();
  const prompt = mockAI.requests.filter((r) => r.stream).pop()!.prompt;
  expect(prompt).toContain("I try to pick the lock");
  expect(prompt).toMatch(/1d20 rolled \d+ = \d+\. Use this result/);
});

test("/narrate adds a narrator line without asking for a reply", async ({ page, mockAI }) => {
  await openChat(page, 1);
  await send(page, "/narrate The rain finally stops.");
  await expect(page.locator('[data-slot="narration"]').getByText("The rain finally stops.")).toBeVisible();
  expect(mockAI.requests).toHaveLength(0);
});

test("a mistyped command stays in the box with a hint", async ({ page, mockAI }) => {
  await openChat(page, 1);
  await send(page, "/dance wildly");
  await expect(page.getByRole("alert")).toContainText("Unknown command /dance");
  await expect(page.getByLabel("Message input")).toHaveValue("/dance wildly");
  expect(mockAI.requests).toHaveLength(0);
});
