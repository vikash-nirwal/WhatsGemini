import type { Page } from "@playwright/test";
import { test, expect, openRoute, openChat } from "./fixtures";

// Reading comfort (#91): a reading font, line spacing and high contrast, set
// in Chat Interface Settings, kept on this device and applied to the chat.

test.use({ seed: { messages: 3 } });

const rootVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test("reading font, spacing and contrast apply at once and stay after a reload", async ({ page }) => {
  await openRoute(page, "/settings/chat");
  await page.getByRole("button", { name: "Lexend", exact: true }).click();
  await page.getByRole("button", { name: "Loose", exact: true }).click();
  await page.getByRole("switch", { name: "High contrast" }).click();

  await expect.poll(() => rootVar(page, "--chat-font-family")).toContain("Lexend");
  await expect.poll(() => rootVar(page, "--chat-line-height")).toBe("2");
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  // High contrast lifts muted text to full strength.
  expect(await rootVar(page, "--muted-foreground")).toBe(await rootVar(page, "--foreground"));

  await openChat(page);
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  const text = page.locator("[data-chat-text]").first();
  await expect(text).toBeVisible();
  const style = await text.evaluate((el) => ({ family: getComputedStyle(el).fontFamily, lineHeight: parseFloat(getComputedStyle(el).lineHeight), size: parseFloat(getComputedStyle(el).fontSize) }));
  expect(style.family).toContain("Lexend");
  expect(style.lineHeight).toBeCloseTo(style.size * 2, 0);
});

test("by default the chat keeps the theme's own font and spacing", async ({ page }) => {
  await openChat(page);
  expect(await rootVar(page, "--chat-font-family")).toBe("");
  expect(await rootVar(page, "--chat-line-height")).toBe("");
  await expect(page.locator("html")).not.toHaveAttribute("data-contrast", "high");
  await expect(page.locator("html")).not.toHaveAttribute("data-reading-font", /.+/);
});
