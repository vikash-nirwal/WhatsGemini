import { test, expect, openChat } from "./fixtures";
import { box, viewportWidth, expectNoHorizontalScroll } from "./layout";

// U10: the terminal theme has its own composer markup ([img] [mask] [silent]
// [cfg] [enter]). Below 640px its tools collapse into one [+] menu, like the
// standard composer's (U3), so the text box keeps most of the row.

const PHONE_MAX_WIDTH = 640;

test.describe("terminal composer", () => {
  test.use({ localStorageOverrides: { color_theme: "terminal" } });

  test("phones: the tools sit behind [+] and the text box gets the room", async ({ page }) => {
    test.skip(viewportWidth(page) >= PHONE_MAX_WIDTH, "phone widths only");
    await openChat(page);
    const row = await box(page.locator('[data-slot="terminal-composer"]'));
    const text = await box(page.getByLabel("Message input"));
    expect(text.width).toBeGreaterThan(row.width * 0.55);
    await expect(page.getByRole("button", { name: "Toggle impersonation mode" })).toBeHidden();

    await page.getByRole("button", { name: "Composer options" }).click();
    const impersonate = page.getByRole("menuitemcheckbox", { name: "Toggle impersonation mode" });
    await expect(impersonate).toHaveAttribute("aria-checked", "false");
    await impersonate.click();
    await expect(page.getByText(/impersonation on/)).toBeVisible();
    await page.getByRole("button", { name: "Composer options" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Toggle impersonation mode" })).toHaveAttribute("aria-checked", "true");
    await expectNoHorizontalScroll(page);
  });

  test("wider screens: the everyday tools are inline bracketed links, the rest behind [+]", async ({ page }) => {
    test.skip(viewportWidth(page) < PHONE_MAX_WIDTH, "wider than phone only");
    await openChat(page);
    const image = page.getByRole("button", { name: "Request an image with this message" });
    await expect(image).toHaveText("[img]");
    await image.click();
    await expect(image).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Toggle impersonation mode" })).toHaveCount(0);
    await page.getByRole("button", { name: "Composer options" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Toggle impersonation mode" })).toBeVisible();
  });
});
