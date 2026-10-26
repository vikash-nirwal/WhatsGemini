import type { Page } from "@playwright/test";
import { test, expect, openRoute, ARIA, KAI } from "./fixtures";

// A made world comes alive (the user's report, 2026-10-26): its people can
// all be given a life in one go, and its card has room for everything.

test.use({ seed: { messages: 2, room: true } });

const charactersInDb = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all: any[] = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").getAll();
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return all;
  });

const moveTo = (page: Page, id: number, worldId: number) =>
  page.evaluate(async ({ id, worldId }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const os = db.transaction("characters", "readwrite").objectStore("characters");
      const get = os.get(id);
      get.onsuccess = () => {
        os.put({ ...get.result, worldId, textsFirst: undefined, postsStatuses: undefined, dayLogs: undefined });
        os.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, { id, worldId });

test("everyone in a world can be given a life at once, and the card is full width", async ({ page }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await moveTo(page, ARIA.id, 1);
  await moveTo(page, KAI.id, 1);
  await page.reload();
  await openRoute(page, "/worlds");

  const card = page.getByLabel("Harbour Town", { exact: true });
  const mine = page.getByLabel("My world", { exact: true });
  expect(Math.abs((await card.boundingBox())!.width - (await mine.boundingBox())!.width)).toBeLessThan(2);

  const lives = card.getByRole("combobox", { name: "How everyone in Harbour Town lives" });
  await expect(lives).toContainText("Low-key");
  await lives.click();
  await page.getByRole("option", { name: "Realistic texter" }).click();
  await expect.poll(async () => (await charactersInDb(page)).filter((c) => c.worldId === 1).every((c) => c.textsFirst && c.postsStatuses && c.dayLogs)).toBe(true);
  await expect(lives).toContainText("Realistic texter");
});
