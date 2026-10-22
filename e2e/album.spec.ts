import { test, expect, openChat, headerAction } from "./fixtures";

// Private albums (#75): photos blurred until tapped; some unlock only at a
// relationship stage (#70).

test.use({ seed: { messages: 4 } });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

test("album photos are blurred until tapped, and a locked one opens at its stage", async ({ page }) => {
  await openChat(page);
  await headerAction(page, "Aria's album");
  const dialog = page.getByRole("dialog", { name: "Aria's album" });
  await dialog.getByTestId("album-input").setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: PNG },
    { name: "b.png", mimeType: "image/png", buffer: PNG },
  ]);
  await dialog.getByRole("button", { name: "Show Photo 1" }).click();
  await expect(dialog.getByRole("button", { name: "Hide Photo 1" })).toBeVisible();

  await dialog.getByRole("combobox", { name: "Photo 2 unlocks at" }).click();
  await page.getByRole("option", { name: "Unlocks at Dating" }).click();
  await expect(dialog.getByRole("button", { name: "Photo 2, locked: Unlocks at Dating" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await headerAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page.getByRole("switch", { name: "Relationship stage" }).click();
  await page.getByRole("list", { name: "Relationship stages" }).getByRole("button", { name: "Dating" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();
  await headerAction(page, "Aria's album");
  await expect(page.getByRole("dialog", { name: "Aria's album" }).getByRole("button", { name: "Show Photo 2" })).toBeEnabled();
});
