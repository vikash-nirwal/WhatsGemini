import path from "path";
import { test, expect, openRoute } from "./fixtures";

const CARD = path.join(__dirname, "data", "character-card.json");

// An empty database, so the imported character is the only one in the gallery.
test.use({ seed: false });

test("import a character card and chat with the result", async ({ page }) => {
  await openRoute(page, "/characters");
  await expect(page.getByRole("button", { name: "Import Card" })).toBeVisible({ timeout: 30_000 });

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import Card" }).click();
  await (await chooser).setFiles(CARD);

  // The card opens in a review dialog before anything is saved.
  const review = page.getByRole("dialog");
  await expect(review.getByRole("button", { name: "Import", exact: true })).toBeEnabled();
  await review.getByRole("button", { name: "Import", exact: true }).click();

  const done = page.getByRole("alertdialog", { name: "Imported" });
  await expect(done).toContainText('Imported "Captain Mira Vale".');
  await done.getByRole("button", { name: "OK" }).click();
  await expect(done).toBeHidden();

  // The new character is in the gallery and its greeting opens the chat.
  await expect(page.getByRole("heading", { name: "Captain Mira Vale" })).toBeVisible();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByLabel("Message input")).toBeVisible();
  await expect(page.getByText("Mind the puddle, traveller. Tea's on the house while the storm lasts.")).toBeVisible();
});
