import type { Page } from "@playwright/test";
import { test, expect, openRoute, ARIA, KAI } from "./fixtures";

// Arrivals and life events (#164): with time, things happen in the lives
// of a world's people, and now and then someone new turns up for you to
// welcome or let pass.

test.use({ seed: { messages: 2, room: true } });

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

test("someone new turns up, and you welcome them", async ({ page, mockAI }) => {
  mockAI.reply((req) =>
    req.prompt.includes("Suggest 1 new people")
      ? '[{"name": "Mira Vale", "idea": "Kai\'s cousin, a ferry pilot back from the islands", "tieWith": "Kai", "tie": "cousin"}]'
      : req.prompt.includes("Create an original roleplay AI character")
        ? '{"name": "Mira Vale", "description": "A ferry pilot.", "prompt": "You are Mira Vale, a ferry pilot.", "first_mes": "Back on dry land."}'
        : "Mock reply"
  );
  await harbourTown(page, { lastLifeAt: NOW });
  await page.clock.fastForward(65_000);
  await expect(page.getByText("Someone new in Harbour Town")).toBeVisible({ timeout: 15_000 });

  await openRoute(page, "/worlds");
  const card = page.getByRole("region", { name: "Someone new" });
  await expect(card).toContainText("Mira Vale · Kai's cousin");
  await card.getByRole("button", { name: "Welcome Mira Vale" }).click();
  await expect(page.getByText("Mira Vale lives in Harbour Town now")).toBeVisible();
  await expect(page.getByRole("region", { name: "Someone new" })).toHaveCount(0);
  const draft = mockAI.requests.find((r) => r.prompt.includes("Mira Vale: Kai's cousin"))!.prompt;
  expect(draft).toContain("They are Kai's cousin");
  await openRoute(page, "/worlds/1/timeline");
  await expect(page.getByRole("list", { name: "World timeline" })).toContainText("Mira Vale arrived");
});

test("something happens in someone's life, and it's on the timeline", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.includes("Something just happened in") ? "Aria got the lighthouse keeper's job." : "Mock reply"));
  await harbourTown(page, { lastNewcomerAt: NOW });
  await page.clock.fastForward(65_000);
  await openRoute(page, "/worlds/1/timeline");
  await expect(page.getByRole("list", { name: "World timeline" })).toContainText("Aria got the lighthouse keeper's job.", { timeout: 15_000 });
});
