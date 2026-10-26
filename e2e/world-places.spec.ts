import type { Page } from "@playwright/test";
import { test, expect, openRoute, ARIA, KAI } from "./fixtures";

// Places with presence (#165): the Worlds page shows who's at each place on
// the map; a place opens to mark who usually goes there and to start a
// scene there with the people you pick.

test.use({ seed: { messages: 2, room: true } });

const patch = (page: Page, store: string, id: number, change: Record<string, unknown>) =>
  page.evaluate(async ({ store, id, change }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const os = db.transaction(store, "readwrite").objectStore(store);
      const get = os.get(id);
      get.onsuccess = () => {
        os.put({ ...get.result, ...change });
        os.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, { store, id, change });

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

test("see who's where, mark a regular, and start a scene at a place", async ({ page, mockAI }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await patch(page, "worlds", 1, { map: { image: PIXEL, pins: [{ id: "p1", name: "The Docks", x: 10, y: 10 }, { id: "p2", name: "Rosa's Café", x: 50, y: 50 }] } });
  await patch(page, "characters", ARIA.id, { worldId: 1, hangout: "p1" });
  await patch(page, "characters", KAI.id, { worldId: 1 });
  await page.reload();
  await openRoute(page, "/worlds");

  await page.getByRole("button", { name: "The Docks, Aria here" }).click();
  const dialog = page.getByRole("dialog", { name: "The Docks" });
  await expect(dialog).toContainText("Here now: Aria.");
  await expect(dialog.getByRole("checkbox", { name: "Aria in the scene" })).toBeChecked();
  // Saved as it's ticked, so Kai counts as here now too.
  await dialog.getByRole("checkbox", { name: "Kai usually here" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Kai usually here" })).toBeChecked();
  await expect(dialog).toContainText("Kai · here now");
  await expect(dialog.getByRole("checkbox", { name: "Kai in the scene" })).toBeChecked();

  mockAI.reply("Oh, hey - didn't expect you down here.");
  await dialog.getByRole("button", { name: "Start a scene here" }).click();
  await expect(page).toHaveURL(/#\/chat\/\d+$/);
  await expect(page.getByLabel("Message input")).toBeVisible();
  await expect(page.getByText("At The Docks", { exact: true }).first()).toBeVisible();
});
