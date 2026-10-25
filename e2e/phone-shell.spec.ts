import type { Page } from "@playwright/test";
import { test, expect, openRoute } from "./fixtures";

// The phone-style shell (#114): with the WhatsApp-style theme on a phone or
// tablet, the chat list is the home screen, with Chats, Updates,
// Characters and Settings tabs under it; a chat goes back to the list.

test.use({ seed: { messages: 4, room: true }, localStorageOverrides: { color_theme: "whatsapp", theme: "light" } });

const putStatus = (page: Page, text: string) =>
  page.evaluate(async (text) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const store = db.transaction("characters", "readwrite").objectStore("characters");
      const get = store.get(1);
      get.onsuccess = () => {
        store.put({ ...get.result, statuses: [{ id: "st-1", text, createdAt: Date.now() - 60_000 }] });
        store.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, text);

test("the chat list is home, with tabs, and a chat goes back to it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "The shell is for phones and tablets");
  await openRoute(page, "/");
  const tabs = page.getByRole("navigation", { name: "Main" });
  await expect(tabs).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "WhatsGemini" })).toBeVisible();

  const list = page.getByRole("complementary", { name: "Sidebar" });
  await list.getByRole("link").filter({ hasText: "Aria" }).filter({ hasNotText: "Kai" }).click();
  await expect(page.getByLabel("Message input")).toBeVisible();
  await expect(tabs).toBeHidden();
  await page.getByRole("button", { name: "Back to chats" }).click();
  await expect(tabs).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);

  // WhatsApp's filter chips: only the group chat under Groups.
  await list.getByRole("button", { name: "Groups" }).click();
  const chatRows = list.locator('a[href*="/chat/"]');
  await expect(chatRows).toHaveCount(1);
  await expect(chatRows).toContainText("Aria & Kai");
  await list.getByRole("button", { name: "All" }).click();
  await expect(chatRows).toHaveCount(2);

  await list.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("dialog", { name: "New chat" })).toBeVisible();
  await page.keyboard.press("Escape");

  await tabs.getByRole("link", { name: "Characters" }).click();
  await expect(page).toHaveURL(/#\/characters$/);
  await tabs.getByRole("link", { name: "Chats" }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test("Updates lists statuses, newest unseen first, and opens them", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "The shell is for phones and tablets");
  await openRoute(page, "/");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible({ timeout: 30_000 });
  await putStatus(page, "Rain on the garage roof again.");
  await page.reload();
  const tabs = page.getByRole("navigation", { name: "Main" });
  await tabs.getByRole("link", { name: "Updates, new" }).click();
  const recent = page.getByRole("region", { name: "Recent updates" });
  await recent.getByRole("button", { name: "Aria's status, new" }).click();
  await expect(page.getByRole("dialog", { name: "Aria's status" })).toContainText("Rain on the garage roof again.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Viewed updates" }).getByRole("button", { name: "Aria's status" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Updates", exact: true })).toBeVisible();
});
