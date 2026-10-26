import { test, expect, openRoute } from "./fixtures";

// Automatic backups (#198): a week without a backup brings a reminder that
// opens the backup settings.

test.use({ seed: { messages: 2, room: true } });

test("a reminder to back up after a week without one", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 11, 0, 0) });
  await page.addInitScript(() => localStorage.setItem("last_backup_at", String(new Date(2026, 9, 10).getTime())));
  await openRoute(page, "/");
  await page.clock.fastForward(95_000);
  await expect(page.getByText("It's been a while since your last backup").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("It's been a while since your last backup")).toHaveCount(1);
  await page.getByRole("button", { name: "Back up" }).click();
  await expect(page).toHaveURL(/#\/settings\/data$/);
});
