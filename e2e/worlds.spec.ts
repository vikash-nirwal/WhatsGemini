import { test, expect, openRoute } from "./fixtures";

// Worlds as spaces (#143): each world has its own people and chats, you
// switch between them like accounts, and a character can join another world
// as a copy that starts fresh there.

test.use({ seed: { messages: 4 } });

const characterIdsInDb = (page: import("@playwright/test").Page) =>
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
    return all.map((c) => ({ name: c.name, worldId: c.worldId, cardOf: c.cardOf, memory: c.memory }));
  });

test("a new world starts empty, someone joins it fresh, and switching back shows your old chats", async ({ page }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await expect(page).toHaveURL(/#\/worlds$/);

  // The manager shows My world (where you are) and the new one.
  await expect(page.getByLabel("Default", { exact: true })).toContainText("You're here");
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("button", { name: /^World: Harbour Town/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^AR Aria/ })).toHaveCount(0);

  // Aria joins from My world: same card, no memories.
  await openRoute(page, "/characters");
  await page.getByRole("button", { name: "From another world" }).click();
  const dialog = page.getByRole("dialog", { name: "Add someone to Harbour Town" });
  await expect(dialog).toContainText("From Default");
  await dialog.getByRole("button", { name: "Add Aria" }).click();
  await expect(dialog).toContainText("Everyone from your other worlds is already here.");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await characterIdsInDb(page)).filter((c) => c.name === "Aria").length).toBe(2);
  const copy = (await characterIdsInDb(page)).find((c) => c.name === "Aria" && c.worldId);
  expect(copy).toMatchObject({ cardOf: 1 });
  expect(copy?.memory).toBeUndefined();

  // Back in My world, the old chat is there again.
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Switch to Default" }).click();
  await expect(page.getByRole("link", { name: /^AR Aria/ })).toBeVisible();
});
