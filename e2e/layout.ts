import { expect, Page, Locator } from "@playwright/test";

// Geometry helpers for layout checks. They assert on measured boxes instead
// of screenshots, so they don't flake on fonts or anti-aliasing.

// Below this width the sidebar is an off-canvas drawer; from it up, it's docked.
export const SIDEBAR_DOCK_MIN_WIDTH = 768;

export const viewportWidth = (page: Page) => page.viewportSize()?.width ?? 0;

export const usesDrawer = (page: Page) => viewportWidth(page) < SIDEBAR_DOCK_MIN_WIDTH;

export const sidebar = (page: Page) => page.getByRole("complementary", { name: "Sidebar" });

// How much of the sidebar is on screen, in px (0 = fully off-canvas).
export const visibleSidebarWidth = async (page: Page) => {
  const box = await sidebar(page).boundingBox();
  if (!box) return 0;
  return Math.max(0, Math.min(box.x + box.width, viewportWidth(page)) - Math.max(box.x, 0));
};

export const expectDrawerOpen = async (page: Page) => {
  const width = await sidebar(page).evaluate((el) => el.getBoundingClientRect().width);
  await expect.poll(() => visibleSidebarWidth(page)).toBeGreaterThanOrEqual(width - 1);
};

export const expectDrawerClosed = async (page: Page) => {
  await expect.poll(() => visibleSidebarWidth(page)).toBe(0);
};

// The page itself never scrolls sideways: nothing pokes out past the viewport.
export const expectNoHorizontalScroll = async (page: Page) => {
  const { scrollWidth, clientWidth, bodyScrollWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(scrollWidth, "document scrolls sideways").toBeLessThanOrEqual(clientWidth);
  expect(bodyScrollWidth, "body scrolls sideways").toBeLessThanOrEqual(clientWidth);
};

// Every element under `root` that sits (partly) outside the viewport's x range
// or inside a horizontally scrolled container - i.e. content a phone user
// can't see without scrolling sideways.
export const elementsCutOffHorizontally = async (root: Locator) =>
  root.evaluate((el) => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    el.querySelectorAll<HTMLElement>("*").forEach((node) => {
      const r = node.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.left < -0.5 || r.right > vw + 0.5) out.push(`${node.tagName.toLowerCase()} "${(node.textContent || "").trim().slice(0, 30)}" [${Math.round(r.left)}, ${Math.round(r.right)}]`);
    });
    return out;
  });

export const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  expect(b, "element has a layout box").not.toBeNull();
  return b!;
};
