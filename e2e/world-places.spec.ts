import type { Page } from "@playwright/test";
import { test, expect, openRoute, ARIA, KAI } from "./fixtures";

// Places with presence (#165): the Worlds page shows who's at each place on
// the map; a place opens to mark who usually goes there and to start a
// scene there with the people you pick.

// The feature is off until switched on; these tests switch it on.
const switchOn = (page: import("@playwright/test").Page) => page.addInitScript((prefs) => localStorage.setItem("world_prefs", JSON.stringify(prefs)), { "1": { places: true } });

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
  await switchOn(page);
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

// #177: with places on, people without a usual spot are given one, so the
// map isn't empty. #176: a scene there talks on its own while you're away.
test("people are given usual spots, and a scene there talks while you're away", async ({ page, mockAI }) => {
  await switchOn(page);
  await page.clock.install({ time: new Date(2026, 9, 21, 10, 0, 0) });
  mockAI.reply((req) => (req.prompt.includes("need a usual spot") ? "Aria | The Docks\nKai | Rosa's Café" : "Mock reply"));
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await patch(page, "worlds", 1, { map: { image: PIXEL, pins: [{ id: "p1", name: "The Docks", x: 10, y: 10 }, { id: "p2", name: "Rosa's Café", x: 50, y: 50 }] } });
  await patch(page, "characters", ARIA.id, { worldId: 1 });
  await patch(page, "characters", KAI.id, { worldId: 1 });
  await page.reload();
  await page.clock.fastForward(65_000);
  await openRoute(page, "/worlds");
  await expect(page.getByRole("button", { name: "The Docks, Aria here" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Rosa's Café, Kai here" })).toBeVisible();

  await page.getByRole("button", { name: "The Docks, Aria here" }).click();
  const dialog = page.getByRole("dialog", { name: "The Docks" });
  await dialog.getByRole("checkbox", { name: "Kai in the scene" }).click();
  await dialog.getByRole("button", { name: "Start a scene here" }).click();
  await expect(page).toHaveURL(/#\/chat\/(\d+)$/);
  const chatId = Number(page.url().match(/chat\/(\d+)$/)![1]);
  const talks = await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const chat: any = await new Promise((resolve) => {
      const get = db.transaction("chats").objectStore("chats").get(id);
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return chat.offscreenTalk;
  }, chatId);
  expect(talks).toBe(true);
});

// #183: where you are. Someone at the same place runs into you, and your
// chats know where you are.
test("you're somewhere, and someone there runs into you", async ({ page, mockAI }) => {
  await switchOn(page);
  const NOW = new Date(2026, 9, 21, 10, 0, 0).getTime();
  await page.clock.install({ time: NOW });
  mockAI.reply((req) => (req.prompt.includes("is at The Docks right now") && req.prompt.includes("Something just happened") ? "wait is that you at the docks??" : "Mock reply"));
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await patch(page, "worlds", 1, { map: { image: PIXEL, pins: [{ id: "p1", name: "The Docks", x: 10, y: 10 }, { id: "p2", name: "Rosa's Café", x: 50, y: 50 }] }, lastHangoutsAt: NOW });
  await patch(page, "characters", ARIA.id, { worldId: 1, hangout: "p1", textsFirst: true, firstTexts: [NOW - 5 * 3_600_000] });
  await patch(page, "characters", KAI.id, { worldId: 1, hangout: "p2" });
  await page.reload();
  await openRoute(page, "/worlds");
  await page.getByRole("combobox", { name: "Where you are" }).click();
  await page.getByRole("option", { name: "The Docks" }).click();
  await page.clock.fastForward(65_000);
  await expect.poll(() => mockAI.requests.some((r) => r.prompt.includes("wait is that you") || r.prompt.includes("is at The Docks right now")), { timeout: 15_000 }).toBe(true);
  await openRoute(page, "/chat/1");
  await expect(page.getByText("wait is that you at the docks??").first()).toBeVisible({ timeout: 15_000 });
});

// #196: the live map shows who's at each place, and you.
test("the live map shows who's where, and you", async ({ page }) => {
  await switchOn(page);
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await patch(page, "worlds", 1, { map: { image: PIXEL, pins: [{ id: "p1", name: "The Docks", x: 10, y: 50 }, { id: "p2", name: "Rosa's Café", x: 60, y: 50 }] }, lastHangoutsAt: Date.now(), youAt: { pinId: "p2", at: Date.now() } });
  await patch(page, "characters", ARIA.id, { worldId: 1, hangout: "p1" });
  await patch(page, "characters", KAI.id, { worldId: 1, hangout: "p2" });
  await page.reload();
  await openRoute(page, "/worlds");
  const map = page.getByRole("group", { name: "Live map" });
  await expect(map.getByRole("button", { name: "The Docks on the map: Aria" })).toBeVisible();
  await map.getByRole("button", { name: "Rosa's Café on the map: Kai, you're here" }).click();
  await expect(page.getByRole("dialog", { name: "Rosa's Café" })).toBeVisible();
});
