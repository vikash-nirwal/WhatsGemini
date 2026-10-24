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

test("a starred message is listed in the Scene panel and can be jumped to", async ({ page }) => {
  await openChat(page, 1);
  const bubble = page.locator('[data-slot="message-bubble"]').filter({ hasText: "User message 28: it was fine, thanks." });
  if (await isTouch(page)) {
    await bubble.dispatchEvent("contextmenu");
    await page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem", { name: "Star", exact: true }).click();
  } else {
    await bubble.hover();
    await bubble.getByRole("button", { name: "Star", exact: true }).click();
  }
  await expect(bubble.getByLabel("Starred")).toBeVisible();

  // Scroll away, then jump back from the Scene panel.
  await page.getByText("Aria message 1: how was your day?").scrollIntoViewIfNeeded();
  await chatAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Story", exact: true }).click();
  await page.getByRole("button", { name: /^Jump to: User message 28/ }).click();
  await expect(bubble).toBeInViewport();
});

// Starred messages (#120): every starred message across chats, opening the
// chat at that message.
test("starred messages are listed across chats and open at the message", async ({ page }) => {
  await openChat(page, 1);
  const bubble = page.locator('[data-slot="message-bubble"]').filter({ hasText: "User message 6: it was fine, thanks." });
  if (await isTouch(page)) {
    await bubble.dispatchEvent("contextmenu");
    await page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem", { name: "Star", exact: true }).click();
  } else {
    await bubble.hover();
    await bubble.getByRole("button", { name: "Star", exact: true }).click();
  }
  await expect(bubble.getByLabel("Starred")).toBeVisible();
  await page.goto("./#/starred");
  const list = page.getByRole("list", { name: "Starred messages" });
  await list.getByRole("button", { name: /^You in Aria: User message 6/ }).click();
  await expect(page).toHaveURL(/#\/chat\/1$/);
  await expect(bubble).toBeInViewport({ timeout: 10_000 });
});
