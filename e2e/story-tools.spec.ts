import { test, expect, openChat } from "./fixtures";
import type { Page } from "@playwright/test";
import fs from "fs";

// "Export as story" (#20) and bookmarks (#21).

test.use({ seed: { messages: 30 } });

const chatAction = async (page: Page, name: string | RegExp) => {
  const direct = page.getByRole("button", { name });
  if (await direct.first().isVisible()) return direct.first().click();
  await page.getByRole("button", { name: /more/i }).last().click();
  await page.getByRole("menuitem", { name }).click();
};

const isTouch = (page: Page) => page.evaluate(() => window.matchMedia("(hover: none)").matches);

test("Export as story downloads readable Markdown", async ({ page }) => {
  await openChat(page, 1);
  const download = page.waitForEvent("download");
  await chatAction(page, /Export as story/);
  const file = await download;
  expect(file.suggestedFilename()).toBe("aria.md");
  const text = fs.readFileSync((await file.path())!, "utf8");
  expect(text).toContain("# Aria");
  expect(text).toContain("**Aria:** Aria message 1: how was your day?");
  expect(text).toContain("User message 30: it was fine, thanks.");
});

test("a bookmarked message is starred, listed in the Scene panel and can be jumped to", async ({ page }) => {
  await openChat(page, 1);
  const bubble = page.locator('[data-slot="message-bubble"]').filter({ hasText: "User message 28: it was fine, thanks." });
  if (await isTouch(page)) {
    await bubble.dispatchEvent("contextmenu");
    await page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem", { name: "Bookmark" }).click();
  } else {
    await bubble.hover();
    await bubble.getByRole("button", { name: "Bookmark" }).click();
  }
  await expect(bubble.getByLabel("Bookmarked")).toBeVisible();

  // Scroll away, then jump back from the Scene panel.
  await page.getByText("Aria message 1: how was your day?").scrollIntoViewIfNeeded();
  await chatAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Story", exact: true }).click();
  await page.getByRole("button", { name: /^Jump to: User message 28/ }).click();
  await expect(bubble).toBeInViewport();
});
