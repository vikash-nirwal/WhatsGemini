import type { Page } from "@playwright/test";
import { test, expect, openChat, headerAction } from "./fixtures";

// Ambient sound (#89): per chat, from the scene or picked by hand, made in
// the browser. <html data-ambient> says what's playing.

test.use({ seed: { messages: 4 } });

const openChatTab = async (page: Page) => {
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: "Options", exact: true }).click();
};

const patchChat = (page: Page, fields: Record<string, unknown>) =>
  page.evaluate(async (fields) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("chats", "readwrite");
      const store = tx.objectStore("chats");
      const get = store.get(1);
      get.onsuccess = () => store.put({ ...get.result, ...fields });
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, fields);

test("turn it on, pick a sound, and turn it off", async ({ page }) => {
  await openChat(page);
  await openChatTab(page);
  await page.getByRole("switch", { name: "Ambient sound" }).click();
  const status = page.getByRole("status").filter({ hasText: /Playing|Nothing in the scene/ });
  await expect(status).toContainText("Nothing in the scene suggests a sound yet");
  await expect(page.locator("html")).not.toHaveAttribute("data-ambient", /.+/);

  await page.getByRole("button", { name: "Rain", exact: true }).click();
  await expect(status).toHaveText("Playing: Rain");
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "rain");

  await page.getByRole("switch", { name: "Ambient sound" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-ambient", /.+/);
});

test("from the scene: the tracked place picks the sound, and it stays on after a reload", async ({ page }) => {
  await openChat(page);
  await patchChat(page, { ambient: { on: true }, sceneTracker: true, sceneState: { location: "the old pier" } });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "sea");
  await openChatTab(page);
  await expect(page.getByRole("status").filter({ hasText: "Playing" })).toHaveText("Playing: Sea (from the scene)");
});
