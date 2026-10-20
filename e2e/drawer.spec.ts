import { test, expect, openRoute } from "./fixtures";
import { expectDrawerClosed, expectDrawerOpen, usesDrawer } from "./layout";

// U5: the off-canvas drawer must close on every route change, not only when
// one of its own links is tapped - otherwise it covers the page you went to.
test.describe("sidebar drawer", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!usesDrawer(page), "the sidebar is docked at this width");
  });

  const openDrawer = async (page: import("@playwright/test").Page) => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expectDrawerOpen(page);
  };

  // Same-document navigation, like a link outside the sidebar.
  const goToHash = async (page: import("@playwright/test").Page, hash: string) => {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
  };

  test("closes on back, forward and navigation from outside it", async ({ page }) => {
    await openRoute(page, "/characters");
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible({ timeout: 30_000 });
    await expectDrawerClosed(page);

    await goToHash(page, "#/chat/1");
    await expect(page.getByLabel("Message input")).toBeVisible();

    await openDrawer(page);
    await page.goBack();
    await expect(page).toHaveURL(/#\/characters$/);
    await expectDrawerClosed(page);

    await openDrawer(page);
    await page.goForward();
    await expect(page).toHaveURL(/#\/chat\/1$/);
    await expectDrawerClosed(page);

    await openDrawer(page);
    await goToHash(page, "#/settings/profile");
    await expect(page).toHaveURL(/#\/settings\/profile$/);
    await expectDrawerClosed(page);
  });

  test("still closes from its own links", async ({ page }) => {
    await openRoute(page, "/characters");
    await openDrawer(page);
    await page.getByRole("complementary", { name: "Sidebar" }).getByText("Aria", { exact: true }).first().click();
    await expect(page).toHaveURL(/#\/chat\/1$/);
    await expectDrawerClosed(page);
  });
});
