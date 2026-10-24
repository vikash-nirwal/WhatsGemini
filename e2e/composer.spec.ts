import { test, expect, openChat, chatMessages } from "./fixtures";
import { box, overlaps, viewportWidth, expectNoHorizontalScroll } from "./layout";

// Layout checks for the chat composer (U1, U2, U3, U6, U8): geometry, not
// pixels, so they hold across themes and fonts.

const SIX_LINES = ["one", "two", "three", "four", "five", "six"].join("\n");
const PHONE_MAX_WIDTH = 640; // below Tailwind's `sm`, where the tools collapse into "+"

const composer = (page: import("@playwright/test").Page) => page.locator('[data-slot="composer"]');
const lastMessage = (page: import("@playwright/test").Page) => chatMessages(page).getByText("User message 30: it was fine, thanks.");

test.describe("chat composer", () => {
  test("a multi-line draft stays inside the composer, which grows with it", async ({ page }) => {
    await openChat(page);
    const input = page.getByLabel("Message input");
    const before = await box(composer(page));
    await input.fill(SIX_LINES);

    const bar = await box(composer(page));
    const text = await box(input);
    expect(bar.height).toBeGreaterThan(before.height);
    expect(text.y).toBeGreaterThanOrEqual(bar.y - 0.5);
    expect(text.y + text.height).toBeLessThanOrEqual(bar.y + bar.height + 0.5);
    // And the whole composer is on screen (dvh, not 100vh, on phones).
    expect(bar.y + bar.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  });

  test("a chat opens scrolled to its newest message, clear of the composer", async ({ page }) => {
    await openChat(page);
    await expect(lastMessage(page)).toBeVisible();
    await page.waitForTimeout(600); // initial scroll + the composer's first measurement
    const message = await box(lastMessage(page));
    const bar = await box(composer(page));
    expect(message.y + message.height).toBeLessThanOrEqual(bar.y);
    await expect(page.getByRole("button", { name: "Scroll to bottom" })).toBeHidden();
  });

  test("the latest message is never hidden behind the composer", async ({ page }) => {
    await openChat(page);
    await page.getByLabel("Message input").fill(SIX_LINES);
    await expect(lastMessage(page)).toBeVisible();
    // Give the list a frame to re-pin to the bottom after the composer grew.
    await page.waitForTimeout(200);
    const message = await box(lastMessage(page));
    const bar = await box(composer(page));
    expect(message.y + message.height).toBeLessThanOrEqual(bar.y);
  });

  test("the scroll-to-bottom button sits above the composer", async ({ page }) => {
    await openChat(page);
    await page.getByLabel("Message input").fill(SIX_LINES);
    await page.getByText("Aria message 1: how was your day?").scrollIntoViewIfNeeded();
    const button = page.getByRole("button", { name: "Scroll to bottom" });
    await expect(button).toBeVisible();
    expect(overlaps(await box(button), await box(composer(page)))).toBe(false);
  });

  test("phones: the tools sit behind one button and the text box gets the room", async ({ page }) => {
    test.skip(viewportWidth(page) >= PHONE_MAX_WIDTH, "phone widths only");
    await openChat(page);
    const bar = await box(composer(page));
    const text = await box(page.getByLabel("Message input"));
    expect(text.width).toBeGreaterThan(bar.width * 0.55);
    await expect(page.getByRole("button", { name: "Toggle impersonation mode" })).toBeHidden();

    await page.getByRole("button", { name: "Composer options" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Toggle impersonation mode" }).click();
    await expect(page.getByText(/Impersonation on/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("wider screens: the everyday tools are inline, the rest behind one button", async ({ page }) => {
    test.skip(viewportWidth(page) < PHONE_MAX_WIDTH, "wider than phone only");
    await openChat(page);
    // The text box keeps most of the bar.
    const bar = await box(composer(page));
    const text = await box(page.getByLabel("Message input"));
    expect(text.width).toBeGreaterThan(bar.width * 0.55);
    const image = page.getByRole("button", { name: "Request an image with this message" });
    await image.click();
    await expect(image).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Send a photo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Toggle impersonation mode" })).toHaveCount(0);
    await page.getByRole("button", { name: "Composer options" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Toggle impersonation mode" }).click();
    await expect(page.getByText(/Impersonation on/)).toBeVisible();
  });
});
