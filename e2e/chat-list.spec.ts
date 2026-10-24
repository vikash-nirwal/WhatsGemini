import type { Page } from "@playwright/test";
import { test, expect, openChat } from "./fixtures";

// A WhatsApp chat list (#115): the last message's preview with ticks,
// unread counts, and mute and archive from each row's menu.

test.use({ seed: { messages: 4, room: true } });

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Sidebar" });
// Below 1024px the list is a drawer behind the header's menu button.
const showList = async (page: Page) => {
  const menu = page.locator("header").first().getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  await expect(sidebar(page)).toBeInViewport();
};
const row = (page: Page, title: string) => sidebar(page).getByRole("link").filter({ hasText: title });
// Aria's own 1:1 chat, not the group chat "Aria & Kai".
const ariaRow = (page: Page) => row(page, "Aria").filter({ hasNotText: "Kai" });
// Picks from a row's menu, once the last menu has finished closing.
const pick = async (page: Page, rowLocator: ReturnType<typeof row>, title: string, item: string) => {
  await expect(page.getByRole("menu")).toHaveCount(0);
  await rowLocator.getByRole("button", { name: `Chat options for ${title}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
};

test("rows preview the last message, and a chat can be muted and archived", async ({ page }) => {
  await openChat(page, 2);
  await showList(page);
  // The 1:1 chat ends with your message: ticks, then the text.
  const aria = ariaRow(page);
  await expect(aria.locator('[data-slot="chat-preview"]')).toContainText("✓✓");
  await expect(aria.locator('[data-slot="chat-preview"]')).toContainText("User message 4");

  await pick(page, aria, "Aria", "Mute");
  await expect(aria.getByLabel("Muted")).toBeVisible();

  await pick(page, aria, "Aria", "Archive chat");
  await expect(row(page, "Aria")).toHaveCount(1); // only the group chat "Aria & Kai" is left
  await sidebar(page).getByRole("button", { name: "Archived, 1 chat" }).click();
  const archived = ariaRow(page);
  await expect(archived).toBeVisible();
  await pick(page, archived, "Aria", "Unarchive chat");
  await expect(sidebar(page).getByRole("button", { name: /^Archived/ })).toHaveCount(0);
  await expect(row(page, "Aria")).toHaveCount(2);
});

test("a text they sent first shows as unread until the chat is opened", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 9, 0, 0) });
  mockAI.reply((req) => (req.prompt.includes("You two haven't texted each other yet") ? "hey, it's Kai" : "Mock reply"));
  await openChat(page, 1);
  // Kai texts first; he has no 1:1 chat yet.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const store = db.transaction("characters", "readwrite").objectStore("characters");
      const get = store.get(2);
      get.onsuccess = () => {
        store.put({ ...get.result, textsFirst: true });
        store.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await page.clock.fastForward(25_000);
  await showList(page);
  const kai = row(page, "Kai").filter({ hasNotText: "Aria" });
  await expect(kai.getByLabel("1 unread")).toBeVisible({ timeout: 15_000 });
  await expect(kai.locator('[data-slot="chat-preview"]')).toContainText("hey, it's Kai");
  await kai.click();
  await expect(page.getByText("hey, it's Kai").first()).toBeVisible();
  await showList(page);
  await expect(kai.getByLabel("1 unread")).toHaveCount(0);
});
