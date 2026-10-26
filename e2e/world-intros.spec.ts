import type { Page } from "@playwright/test";
import { test, expect, openRoute, ARIA, KAI } from "./fixtures";

// Introductions (#167): someone you talk to gives your number to a person
// in their life, who texts you first knowing what they've heard.

// The feature is off until switched on; these tests switch it on.
const switchOn = (page: import("@playwright/test").Page) => page.addInitScript((prefs) => localStorage.setItem("world_prefs", JSON.stringify(prefs)), { "1": { events: true, introductions: true } });

test.use({ seed: { messages: 8, room: true } });

const NOW = new Date(2026, 9, 21, 10, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

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

// A world with Aria and Kai in it, where you are. `world` patches the world.
// Rolls come up low, so whatever is due happens.
const harbourTown = async (page: Page, world: Record<string, unknown>) => {
  await switchOn(page);
  await page.addInitScript(() => {
    let n = 0;
    Math.random = () => 0.01 + ((n++ * 0.0137) % 0.2);
  });
  await page.clock.install({ time: NOW });
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await patch(page, "characters", ARIA.id, { worldId: 1 });
  await patch(page, "characters", KAI.id, { worldId: 1 });
  // A storm is on, so the world doesn't start an event of its own.
  await patch(page, "worlds", 1, { events: [{ id: "e1", title: "Storm", text: "Wind.", at: NOW, endsAt: NOW + 3 * DAY }], ...world });
  await page.reload();
};

test("Aria introduces you to her brother, who texts first", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.includes("just introduced Kai to") ? "Hey, it's Kai - Aria's brother. She says you're trouble." : "Mock reply"));
  await harbourTown(page, {});
  await patch(page, "characters", ARIA.id, { worldId: 1, ties: [{ withId: KAI.id, tie: "your brother" }], memory: ["They fixed her bike"] });
  await patch(page, "characters", KAI.id, { worldId: 1, ties: [{ withId: ARIA.id, tie: "your sister" }] });
  await page.reload();
  await page.clock.fastForward(65_000);
  await expect(page.getByText("Aria introduced you to Kai")).toBeVisible({ timeout: 15_000 });
  const ask = mockAI.requests.find((r) => r.prompt.includes("just introduced Kai to"))!.prompt;
  expect(ask).toContain("What Aria has told Kai about");
  expect(ask).toContain("They fixed her bike");
  await openRoute(page, "/");
  await expect(page.getByRole("link", { name: /^KA Kai/ })).toContainText("She says you're trouble.");
});
