import { test, expect, openChat } from "./fixtures";
import { box, overlaps, viewportWidth } from "./layout";
import type { Locator, Page } from "@playwright/test";

// Message actions (U7, and the message-bubble half of U4): no control sits on
// top of message text, touch screens get a long-press action sheet instead of
// an invisible hover row, and the hover row still works with a mouse.

const isTouch = (page: Page) => page.evaluate(() => window.matchMedia("(hover: none)").matches);

const bubble = (page: Page, text: string) => page.locator('[data-slot="message-bubble"]').filter({ hasText: text });
const userBubble = (page: Page) => bubble(page, "User message 30: it was fine, thanks.");
const aiBubble = (page: Page) => bubble(page, "Aria message 29: how was your day?");

// Visible buttons inside a bubble whose box overlaps its text.
const buttonsOverText = async (target: Locator, text: string) => {
  const textBox = await box(target.getByText(text));
  const out: string[] = [];
  for (const button of await target.getByRole("button").all()) {
    if (!(await button.isVisible())) continue;
    const b = await button.boundingBox();
    if (b && overlaps(b, textBox)) out.push((await button.getAttribute("aria-label")) || "button");
  }
  return out;
};

const longPress = async (page: Page, target: Locator) => {
  const b = await box(target);
  const point = { identifier: 0, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 };
  await target.dispatchEvent("touchstart", { touches: [point], changedTouches: [point], targetTouches: [point] });
  await page.waitForTimeout(650);
  await target.dispatchEvent("touchend", { touches: [], changedTouches: [point], targetTouches: [] });
};

test.describe("message actions", () => {
  test("no button sits on top of message text", async ({ page }) => {
    await openChat(page);
    await userBubble(page).hover();
    expect(await buttonsOverText(userBubble(page), "User message 30: it was fine, thanks.")).toEqual([]);
    await aiBubble(page).hover();
    expect(await buttonsOverText(aiBubble(page), "Aria message 29: how was your day?")).toEqual([]);
  });

  test("touch: no empty action strip, and a long-press opens the action sheet", async ({ page }) => {
    await openChat(page);
    test.skip(!(await isTouch(page)), "touch screens only");
    // The hover-only row is gone rather than invisible-but-taking-space.
    await expect(aiBubble(page).getByRole("button", { name: "Regenerate" })).toBeHidden();
    await expect(userBubble(page).getByRole("button", { name: "Edit" })).toBeHidden();

    await longPress(page, aiBubble(page));
    const sheet = page.getByRole("menu", { name: "Message actions" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("menuitem", { name: "Regenerate" })).toBeVisible();
    await expect(sheet.getByRole("menuitem", { name: "Copy" })).toBeVisible();
    // The sheet fits on screen.
    const s = await box(sheet);
    expect(s.y + s.height).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
    expect(s.x).toBeGreaterThanOrEqual(-0.5);
    expect(s.x + s.width).toBeLessThanOrEqual(viewportWidth(page) + 0.5);

    await sheet.getByRole("menuitem", { name: "Edit" }).click();
    await expect(sheet).toBeHidden();
  });

  test("touch: scrolling past a message doesn't open the sheet", async ({ page }) => {
    await openChat(page);
    test.skip(!(await isTouch(page)), "touch screens only");
    const target = aiBubble(page);
    const b = await box(target);
    const start = { identifier: 0, clientX: b.x + 20, clientY: b.y + 20 };
    const moved = { ...start, clientY: start.clientY + 60 };
    await target.dispatchEvent("touchstart", { touches: [start], changedTouches: [start], targetTouches: [start] });
    await target.dispatchEvent("touchmove", { touches: [moved], changedTouches: [moved], targetTouches: [moved] });
    await page.waitForTimeout(650);
    await target.dispatchEvent("touchend", { touches: [], changedTouches: [moved], targetTouches: [] });
    await expect(page.getByRole("menu", { name: "Message actions" })).toBeHidden();
  });

  test("mouse: the footer actions are there on hover", async ({ page }) => {
    await openChat(page);
    test.skip(await isTouch(page), "mouse/trackpad only");
    await userBubble(page).hover();
    await expect(userBubble(page).getByRole("button", { name: "Edit" })).toBeVisible();
    await aiBubble(page).hover();
    await expect(aiBubble(page).getByRole("button", { name: "Regenerate" })).toBeVisible();
  });
});
