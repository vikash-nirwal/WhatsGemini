import { test, expect, openRoute } from "./fixtures";

// Talk that fits the era (#216): a world talks by texts or letters, from
// its era unless set by hand on the Worlds page.

test.use({ seed: { messages: 2 } });

test("how a world's people talk can be set by hand, and is kept", async ({ page }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await openRoute(page, "/worlds");

  const picker = page.getByRole("combobox", { name: "How people in Harbour Town talk" });
  // No era: texts, as before.
  await expect(picker).toContainText("From the era (texts)");
  await picker.click();
  await page.getByRole("option", { name: "Letters" }).click();
  await expect(picker).toContainText("Letters");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "How people in Harbour Town talk" })).toContainText("Letters");
});
