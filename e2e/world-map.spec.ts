import { test, expect, openChat, openRoute, headerAction } from "./fixtures";

// World map (#66): a World's map with pinned places; a chat set in that
// world shows where the scene is.

test.use({ seed: { messages: 4 } });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

test("a map is uploaded, places pinned, and the chat shows where the scene is", async ({ page }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Eldoria");
  await page.locator("#world-premise").fill("A floating archipelago where storms carry magic.");
  await page.getByTestId("world-map-input").setInputFiles({ name: "map.png", mimeType: "image/png", buffer: PNG });
  const map = page.getByRole("button", { name: "World map: click to add a place" });
  await expect(map).toBeVisible();
  await map.click({ position: { x: 40, y: 20 } });
  await page.getByLabel("Place name").fill("Saltmere");
  await page.getByRole("button", { name: "Create World" }).click();
  await expect(page).toHaveURL(/#\/worlds$/);

  await openChat(page);
  await headerAction(page, "Scene & story");
  await page.getByRole("combobox", { name: "World for this chat" }).click();
  await page.getByRole("option", { name: "Eldoria" }).click();
  await page.getByRole("switch", { name: "Track the scene" }).click();
  await page.getByLabel("location", { exact: true }).fill("the docks at Saltmere");
  await expect(page.getByRole("img", { name: "World map, you are at Saltmere" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Saltmere (you are here)" })).toBeVisible();
});

// Factions on the map (#246): a place given to a faction in the pin editor
// shows in its colour with a legend, and the legend filters the map.
test("places belong to factions, shown in a legend that filters the map", async ({ page }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Eldoria");
  await page.locator("#world-premise").fill("A floating archipelago where storms carry magic.");
  await page.getByRole("button", { name: "Create World" }).click();
  await expect(page).toHaveURL(/#\/worlds$/);
  // The world has a map with two places, and two factions.
  const worldId = await page.evaluate(async (png) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const id = await new Promise<number>((resolve) => {
      const os = db.transaction("worlds", "readwrite").objectStore("worlds");
      const all = os.getAll();
      all.onsuccess = () => {
        const w = all.result.find((x: { name: string }) => x.name === "Eldoria");
        os.put({
          ...w,
          map: { image: `data:image/png;base64,${png}`, pins: [{ id: "p1", name: "Saltmere", x: 20, y: 30 }, { id: "p2", name: "The Spire", x: 70, y: 60 }] },
          factions: [{ id: "f1", name: "Storm Guild", kind: "faction", memberIds: [] }, { id: "f2", name: "The Vales", kind: "family", memberIds: [] }],
        });
        os.transaction.oncomplete = () => resolve(w.id);
      };
    });
    db.close();
    return id;
  }, PNG.toString("base64"));
  await page.reload();
  await openRoute(page, `/worlds/${worldId}/edit`);

  await page.getByRole("button", { name: "Saltmere", exact: true }).click();
  await page.getByRole("combobox", { name: "Whose place" }).click();
  await page.getByRole("option", { name: "Storm Guild" }).click();
  const legend = page.getByRole("group", { name: "Factions on the map" });
  await expect(legend.getByRole("button", { name: "Storm Guild" })).toBeVisible();
  await expect(legend.getByRole("button", { name: "No faction" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Saltmere, Storm Guild" })).toBeVisible();

  // Only the guild's places, then every place again.
  await legend.getByRole("button", { name: "Storm Guild" }).click();
  await expect(legend.getByRole("button", { name: "Storm Guild" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "The Spire", exact: true })).toHaveCount(0);
  await legend.getByRole("button", { name: "Storm Guild" }).click();
  await expect(page.getByRole("button", { name: "The Spire", exact: true })).toBeVisible();

  // Saved with the world.
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page).toHaveURL(/#\/worlds$/);
  const pins = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all: { name: string; map?: { pins: { name: string; factionId?: string }[] } }[] = await new Promise((r) => {
      const q = db.transaction("worlds").objectStore("worlds").getAll();
      q.onsuccess = () => r(q.result);
    });
    db.close();
    return all.find((w) => w.name === "Eldoria")?.map?.pins;
  });
  expect(pins).toEqual([expect.objectContaining({ name: "Saltmere", factionId: "f1" }), expect.objectContaining({ name: "The Spire" })]);
  expect(pins?.[1].factionId).toBeUndefined();
});
