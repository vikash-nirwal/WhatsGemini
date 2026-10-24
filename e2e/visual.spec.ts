import { test, expect, openChat, openRoute } from "./fixtures";

// T5 screenshot tests, deliberately few: the chat screen in every color
// theme (desktop and phone), plus the character gallery at every size.
// Geometry specs catch overlap and overflow; these catch "the theme broke"
// regressions those can't see.
//
// Tagged @visual and run locally only (`npm run test:visual`, refresh with
// `npm run test:visual:update`): fonts render differently on Linux CI, so
// these baselines are macOS ones and CI skips them (see ci.yml).

const THEMES = ["cozy", "neumorphic", "aurora", "terminal", "parchment", "material", "whatsapp"] as const;
const SNAPSHOT = { maxDiffPixelRatio: 0.01 };

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ localStorageOverrides: { color_theme: theme, theme: "dark" } });

    test(`chat screen @visual`, async ({ page }, testInfo) => {
      test.skip(!["desktop", "pixel"].includes(testInfo.project.name), "chat screens are captured on desktop and Pixel only");
      await openChat(page);
      await expect(page.getByText("User message 30: it was fine, thanks.")).toBeVisible();
      await page.waitForTimeout(500); // entrance animations, the composer's first measurement
      await expect(page).toHaveScreenshot(`chat-${theme}.png`, SNAPSHOT);
    });
  });
}

test("character gallery @visual", async ({ page }) => {
  await openRoute(page, "/characters");
  await expect(page.getByText("Aria").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot("characters.png", SNAPSHOT);
});
