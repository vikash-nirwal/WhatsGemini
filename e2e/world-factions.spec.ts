import type { Page } from "@playwright/test";
import { test, expect, openRoute, ARIA, KAI } from "./fixtures";

// Families and factions (#171): suggested from the cast, each with its own
// group chat; members' replies know who they belong with.

test.use({ seed: { messages: 2, room: true } });

const patch = (page: Page, id: number, change: Record<string, unknown>) =>
  page.evaluate(async ({ id, change }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const os = db.transaction("characters", "readwrite").objectStore("characters");
      const get = os.get(id);
      get.onsuccess = () => {
        os.put({ ...get.result, ...change });
        os.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, { id, change });

test("a suggested family gets its own group chat", async ({ page, mockAI }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await patch(page, ARIA.id, { worldId: 1 });
  await patch(page, KAI.id, { worldId: 1 });
  await page.reload();
  await openRoute(page, "/worlds");

  const section = page.getByRole("region", { name: "Families and factions" });
  mockAI.reply("GROUP: The Vales | family | Aria, Kai | An old fishing family that never forgives");
  await section.getByRole("button", { name: "Suggest" }).click();
  await section.getByRole("button", { name: "Add The Vales" }).click();
  await expect(section).toContainText("The Vales · family");
  await expect(page.getByRole("region", { name: "Current world" })).toContainText("The Vales");

  mockAI.reply("Mock reply");
  await section.getByRole("button", { name: "Group chat" }).click();
  await expect(page).toHaveURL(/#\/chat\/\d+$/);
  await expect(page.getByText("The Vales", { exact: true }).first()).toBeVisible();
});
