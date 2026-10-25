import { test, expect } from "./fixtures";

// Relationship map (#138): Characters › Relationship map draws you in the
// middle with each character around you, and lists every bond.

test.use({ seed: { room: true } });

test("the map shows you, your characters and your bonds with them", async ({ page }) => {
  await page.goto("/#/characters");
  await page.getByRole("button", { name: "Relationship map" }).click();
  const dialog = page.getByRole("dialog", { name: "Relationship map" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Relationship map: You and Aria, Kai" })).toBeVisible();
  await expect(dialog.getByRole("list", { name: "Bonds" }).getByRole("listitem")).toHaveText(["Aria · New Friend", "Kai · Rival"]);
});
