import { test, expect, openRoute, ARIA, KAI } from "./fixtures";

// Meeting first (#236): strangers in the same world don't text each other
// out of the blue; they meet in person, and from then on they've met.

test.use({ seed: { messages: 2, room: false } });

const db = <T,>(page: import("@playwright/test").Page, fn: string, arg?: unknown) =>
  page.evaluate(async ({ fn, arg }) => {
    const open: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const out = await new AsyncFunction("db", "arg", fn)(open, arg);
    open.close();
    return out;
  }, { fn, arg }) as Promise<T>;

test("strangers in a world meet in person once, then they've met", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 28, 11, 0, 0) });
  mockAI.reply((req) => (req.prompt.includes("have never met") ? "Kai: Hi, I'm Kai. I fix boats.\nAria: Aria. I run the bakery." : "Mock reply"));
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port.");
  await page.getByRole("button", { name: "Create World" }).click();
  await expect(page.getByRole("button", { name: "Switch to Harbour Town" })).toBeVisible();

  // Aria and a stranger, Kai, both live there; nobody has tied them.
  await db(page, `
    const worlds = await new Promise((r) => { const q = db.transaction("worlds").objectStore("worlds").getAll(); q.onsuccess = () => r(q.result); });
    const worldId = worlds.find((w) => w.name === "Harbour Town").id;
    const tx = db.transaction("characters", "readwrite");
    const store = tx.objectStore("characters");
    const aria = await new Promise((r) => { const q = store.get(${ARIA.id}); q.onsuccess = () => r(q.result); });
    store.put({ ...aria, worldId });
    store.put({ ...aria, id: ${KAI.id}, name: "Kai", prompt: "A boat mechanic.", worldId, ties: undefined, knowsAbout: undefined });
    await new Promise((r) => { tx.oncomplete = r; });
  `);
  await page.reload();
  await page.clock.fastForward(45_000);

  await expect.poll(() => mockAI.requests.filter((r) => r.prompt.includes("have never met")).length, { timeout: 15_000 }).toBe(1);
  const ask = mockAI.requests.find((r) => r.prompt.includes("have never met"))!.prompt;
  expect(ask).toContain("Write a conversation in person between");
  expect(ask).toContain("run into each other around town");
  // Nobody asked them for a text conversation as if they were friends.
  expect(mockAI.requests.some((r) => r.prompt.includes("Write a text conversation between"))).toBe(false);
  await expect.poll(() => db<number[] | undefined>(page, `return await new Promise((r) => { const q = db.transaction("characters").objectStore("characters").get(${ARIA.id}); q.onsuccess = () => r(q.result.met); });`)).toEqual([KAI.id]);
});
