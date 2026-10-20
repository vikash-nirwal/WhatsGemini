import { test, expect, openRoute } from "./fixtures";
import { expectNoHorizontalScroll, expectNothingCutOffHorizontally, viewportWidth } from "./layout";

// U9: the wizard step bars used to scroll sideways on phones, cutting later
// steps off at the edge. Where the full row doesn't fit, a compact
// "Step n of N · Label" line with a progress bar replaces it.
const wizards = [
  { name: "character editor", route: "/characters/new", steps: 6, first: "Identity", last: "Test & Finalize" },
  { name: "adventure wizard", route: "/adventures/new", steps: 5, first: "World", last: "Review" },
];

for (const wizard of wizards) {
  test(`${wizard.name}: no sideways scrolling, every step reachable at a glance`, async ({ page }) => {
    await openRoute(page, wizard.route);
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible({ timeout: 30_000 });
    // Let fonts settle: the step row's width depends on them.
    await page.evaluate(() => document.fonts.ready);

    const compact = page.getByTestId("wizard-steps-compact");
    if (viewportWidth(page) < 640) {
      await expect(compact).toBeVisible();
      await expect(compact).toContainText(`Step 1 of ${wizard.steps} · ${wizard.first}`);
      await expect(page.getByRole("progressbar", { name: "Wizard progress" })).toHaveAttribute("aria-valuenow", "1");
    }
    if (!(await compact.isVisible())) {
      // Full row: the first and last steps are fully on screen. Step buttons
      // are named by their number and label, e.g. "1 Identity".
      await expect(page.getByRole("button", { name: `1 ${wizard.first}`, exact: true })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: `${wizard.steps} ${wizard.last}`, exact: true })).toBeInViewport({ ratio: 1 });
    }

    await expectNoHorizontalScroll(page);
    await expectNothingCutOffHorizontally(page.locator("main"));
  });
}
