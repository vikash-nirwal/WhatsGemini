import { test, expect } from "@playwright/test";

// No fixtures here on purpose: a brand-new visitor must land on the 18+ gate.
test("a first visit shows the age gate", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Adults only" })).toBeVisible();
  await expect(page.getByRole("button", { name: "I'm 18 or older" })).toBeVisible();
});
