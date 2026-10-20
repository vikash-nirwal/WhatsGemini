import { test, expect, openChat } from "./fixtures";
import { box, overlaps, viewportWidth } from "./layout";
import type { Page } from "@playwright/test";

// The chat's side panels (Scene, Participants): a full-screen sheet on
// phones, a panel over the right of the chat on tablets, a column beside
// the chat from 1280px - and the floating composer never runs under it.

const PHONE_MAX_WIDTH = 768; // below Tailwind `md`
const PANEL_COLUMN_MIN_WIDTH = 1280; // Tailwind `xl`

const openScene = async (page: Page) => {
  const direct = page.getByRole("button", { name: "Scene & chat settings" });
  if (await direct.isVisible()) {
    await direct.click();
  } else {
    await page.getByRole("button", { name: /more/i }).last().click();
    await page.getByRole("menuitem", { name: "Scene & chat settings" }).click();
  }
  const panel = page.locator("aside").filter({ has: page.getByRole("button", { name: "Close scene panel" }) });
  await expect(panel).toBeVisible();
  return panel;
};

test("wide screens: the scene panel sits beside the chat and the composer stays clear of it", async ({ page }) => {
  test.skip(viewportWidth(page) < PANEL_COLUMN_MIN_WIDTH, "column layout only");
  await openChat(page);
  const panel = await openScene(page);
  const composer = page.locator('[data-slot="composer"]');
  await expect(composer).toBeVisible();
  expect(overlaps(await box(composer), await box(panel))).toBe(false);
  // And the chat column keeps real room.
  const input = await box(page.getByLabel("Message input"));
  expect(input.width).toBeGreaterThan(200);
});

test("phones: the scene panel fills the screen and closes again", async ({ page }) => {
  test.skip(viewportWidth(page) >= PHONE_MAX_WIDTH, "phone sheet only");
  await openChat(page);
  const panel = await openScene(page);
  const b = await box(panel);
  expect(b.x).toBeLessThanOrEqual(0.5);
  expect(b.width).toBeGreaterThanOrEqual(viewportWidth(page) - 0.5);
  // Nothing from the chat (like the composer's Send button) is on top of it.
  const send = page.getByRole("button", { name: "Send Message" });
  const sendBox = await box(send);
  const topmost = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest("aside") ? "panel" : "chat";
  }, { x: sendBox.x + sendBox.width / 2, y: sendBox.y + sendBox.height / 2 });
  expect(topmost).toBe("panel");

  await panel.getByRole("button", { name: "Close scene panel" }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByLabel("Message input")).toBeVisible();
});

test("tablets: the scene panel slides over the right of the chat, on top of it", async ({ page }) => {
  const width = viewportWidth(page);
  test.skip(width < PHONE_MAX_WIDTH || width >= PANEL_COLUMN_MIN_WIDTH, "tablet widths only");
  await openChat(page);
  const panel = await openScene(page);
  const b = await box(panel);
  expect(b.x + b.width).toBeGreaterThanOrEqual(width - 0.5);
  expect(b.width).toBeLessThan(width / 2);
  expect(b.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 0.5);
  const topmost = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("aside")), { x: b.x + b.width / 2, y: b.y + b.height - 40 });
  expect(topmost).toBe(true);
});
