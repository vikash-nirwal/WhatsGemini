import { test, expect, openRoute } from "./fixtures";

// Background people (#218): with the switch on, a world lists the people
// around who aren't characters, and you can remove one.

test.use({ seed: { messages: 2 } });

test("people around them are listed with the switch on, and can be removed", async ({ page }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await openRoute(page, "/worlds");

  // Off until you switch it on for the world.
  await expect(page.getByRole("region", { name: "People around" })).toHaveCount(0);
  await page.getByRole("group", { name: "Life in Harbour Town" }).getByText("People around them").click();
  const section = page.getByRole("region", { name: "People around" });
  await expect(section).toContainText("Nobody yet.");

  // Someone who came up in their talk.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const store = db.transaction("worlds", "readwrite").objectStore("worlds");
    const all: any[] = await new Promise((resolve) => { const r = store.getAll(); r.onsuccess = () => resolve(r.result); });
    const world = all.find((w) => w.name === "Harbour Town");
    await new Promise<void>((resolve) => { store.put({ ...world, extras: [{ name: "Tom", about: "the harbour master", at: Date.now() }] }); store.transaction.oncomplete = () => resolve(); });
    db.close();
  });
  await page.reload();
  await expect(section).toContainText("Tom the harbour master");
  await section.getByRole("button", { name: "Remove Tom" }).click();
  await expect(section).toContainText("Nobody yet.");
});
