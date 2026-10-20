import { test, expect, openChat } from "./fixtures";
import { box, expectDrawerClosed, overlaps, sidebar, usesDrawer, viewportWidth } from "./layout";

// U4 (sidebar/header half): at 768px the docked 300px sidebar squeezed the
// chat header until the title read "A.." beside nine crammed icons. The
// sidebar now docks from 1024px, and below that the header's actions live in
// one "more" menu.
test.describe("chat header", () => {
  test("the title keeps its room and no header control overlaps another", async ({ page }) => {
    await openChat(page, 1);
    const header = page.locator("header").first();
    const title = header.locator(".truncate", { hasText: /^Aria$/ }).first();
    await expect(title).toBeVisible();

    // Shown in full, not cut to "A..".
    const { scrollWidth, clientWidth } = await title.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth, "title is truncated").toBeLessThanOrEqual(clientWidth);

    // Every visible control sits inside the header, clear of the title and of each other.
    const headerBox = await box(header);
    const titleBox = await box(title);
    const controls = header.locator("button:visible");
    const boxes = [];
    for (let i = 0; i < (await controls.count()); i++) {
      const b = await box(controls.nth(i));
      expect(b.x).toBeGreaterThanOrEqual(headerBox.x - 0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 0.5);
      expect(overlaps(b, titleBox), "a header control covers the title").toBe(false);
      boxes.push(b);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j]), `header controls ${i} and ${j} overlap`).toBe(false);
      }
    }

    // A longer name would still have room: from the title's left edge to the
    // first control on its right there's at least 120px.
    const rightControls = boxes.filter((b) => b.x >= titleBox.x + titleBox.width);
    const roomEnd = rightControls.length ? Math.min(...rightControls.map((b) => b.x)) : headerBox.x + headerBox.width;
    expect(roomEnd - titleBox.x, "room for the title").toBeGreaterThanOrEqual(120);
  });

  test("tablet: the sidebar is a drawer and the header actions are in one menu", async ({ page }) => {
    const width = viewportWidth(page);
    test.skip(width < 700 || width >= 1024, "tablet widths only");
    await openChat(page, 1);
    expect(usesDrawer(page)).toBe(true);
    await expectDrawerClosed(page);

    const header = page.locator("header").first();
    await expect(header.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(header.getByRole("button", { name: "More options" })).toBeVisible();
    // Only a handful of controls remain: menu, back/avatar, more.
    expect(await header.locator("button:visible").count()).toBeLessThanOrEqual(4);

    // The chat gets the whole width.
    const mainBox = await box(page.locator("main"));
    expect(mainBox.width).toBeGreaterThanOrEqual(width - 1);
  });

  test("desktop: the sidebar is docked beside the chat", async ({ page }) => {
    test.skip(usesDrawer(page), "the sidebar is a drawer at this width");
    await openChat(page, 1);
    const sidebarBox = await box(sidebar(page));
    const mainBox = await box(page.locator("main"));
    expect(sidebarBox.x).toBeGreaterThanOrEqual(0);
    expect(sidebarBox.x + sidebarBox.width).toBeLessThanOrEqual(mainBox.x + 0.5);
    await expect(page.locator("header").first().getByRole("button", { name: "Open menu" })).toBeHidden();
  });
});
