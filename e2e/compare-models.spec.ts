import { test, expect, openChat, headerAction, messageBubble } from "./fixtures";

// Compare two models (#88): the latest reply again from another model, side
// by side with the current one; the one you keep stays.

// Three seeded messages, so the latest is Aria's.
test.use({ seed: { messages: 3 } });

const ORIGINAL = "Aria message 3: how was your day?";

const compare = async (page: import("@playwright/test").Page) => {
  await headerAction(page, "Compare two models (the latest reply)");
  const dialog = page.getByRole("dialog", { name: "Compare two models" });
  await dialog.getByRole("textbox", { name: "Model to compare" }).fill("llama3.1");
  await dialog.getByRole("button", { name: "Compare" }).click();
  await expect(dialog.getByRole("region")).toHaveCount(2);
  return dialog;
};

test("the other model's reply shows next to the current one, and keeping it drops the original", async ({ page, mockAI }) => {
  mockAI.reply("A different take on my day, told sideways.");
  await openChat(page);
  const dialog = await compare(page);

  expect(mockAI.requests.filter((r) => r.stream).map((r) => r.model)).toEqual(["llama3.1"]);
  const theirs = dialog.getByRole("region").filter({ hasText: "llama3.1" });
  await expect(theirs).toContainText("A different take on my day");
  await expect(dialog.getByRole("region").filter({ hasNotText: "llama3.1" })).toContainText(ORIGINAL);

  await theirs.getByRole("button", { name: "Keep this one" }).click();
  await expect(dialog).toBeHidden();
  await expect(messageBubble(page, "A different take on my day")).toBeVisible();
  await expect(messageBubble(page, ORIGINAL)).toHaveCount(0);
  await expect(page.getByText(/^\d+ \/ \d+$/)).toHaveCount(0);
});

test("keeping the current reply drops the other one", async ({ page, mockAI }) => {
  mockAI.reply("A different take on my day, told sideways.");
  await openChat(page);
  const dialog = await compare(page);
  await dialog.getByRole("region").filter({ hasNotText: "llama3.1" }).getByRole("button", { name: "Keep this one" }).click();
  await expect(dialog).toBeHidden();
  await expect(messageBubble(page, ORIGINAL)).toBeVisible();
  await expect(messageBubble(page, "A different take on my day")).toHaveCount(0);
});
