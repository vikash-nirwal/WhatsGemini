import { test, expect, openRoute, ARIA, KAI } from "./fixtures";
import type { Page } from "@playwright/test";

// Catch-up that fits the absence (#213): with world turns on, coming back
// after days away tells you what you missed in that world, from what was
// recorded meanwhile, in the "While you were away" card.

test.use({ seed: { messages: 2 } });

const STORY = "The harbour glowed with lanterns all week, and Kai and Aria spent most evenings down by the water.";

// Puts both people in the world and gives it something that happened
// two days ago.
const seedWorld = (page: Page, name: string) =>
  page.evaluate(async ({ name, ids }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(["worlds", "characters", "settings"], "readwrite");
    const worlds: any[] = await new Promise((resolve) => { const r = tx.objectStore("worlds").getAll(); r.onsuccess = () => resolve(r.result); });
    const world = worlds.find((w) => w.name === name);
    for (const [id, other] of [[ids[0], ids[1]], [ids[1], ids[0]]]) {
      const store = tx.objectStore("characters");
      const get = store.get(id);
      get.onsuccess = () => store.put({ ...get.result, worldId: world.id, ties: [{ withId: other, tie: "your friend" }] });
    }
    tx.objectStore("settings").put({ key: `world_timeline_${world.id}`, value: [{ id: "tl-1", at: Date.now() - 2 * 86_400_000, kind: "event", text: "The Lantern Festival began" }] });
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  }, { name, ids: [ARIA.id, KAI.id] });

test("back after days away, a world on world turns tells you what you missed", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.includes("Tell them what they missed") ? STORY : "Mock reply"));
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await openRoute(page, "/worlds");
  // Off until you switch it on for the world.
  await page.getByRole("group", { name: "Life in Harbour Town" }).getByText("One call per world turn").click();
  await seedWorld(page, "Harbour Town");
  // Set as the next page starts: leaving this one saves "last seen" (now).
  await page.addInitScript(() => {
    if (sessionStorage.getItem("away-set")) return;
    sessionStorage.setItem("away-set", "1");
    localStorage.setItem("app_last_seen", String(Date.now() - 3 * 86_400_000));
  });
  await page.goto("./#/");
  await page.reload();

  const card = page.getByRole("region", { name: "While you were away" });
  await expect(card).toContainText(STORY, { timeout: 60_000 });
  await expect(card).toContainText("These 3 days in Harbour Town");
  const ask = mockAI.requests.find((r) => r.prompt.includes("Tell them what they missed"))!.prompt;
  expect(ask).toContain("for 3 days");
  expect(ask).toContain("- The Lantern Festival began");
});
