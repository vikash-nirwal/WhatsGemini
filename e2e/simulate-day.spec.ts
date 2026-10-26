import { test, expect, openRoute, ARIA, KAI } from "./fixtures";

// Simulate a day (#191): a day of background life happens now - here, two
// people who know each other text, and someone posts a status.

test.use({ seed: { messages: 2, room: true } });

test("a day of life happens on demand", async ({ page, mockAI }) => {
  // Daytime, when people are awake to text.
  await page.clock.install({ time: new Date(2026, 9, 21, 11, 0, 0) });
  mockAI.reply((req) => (req.prompt.includes("Write a text conversation between") ? "Aria: you up?\nKai: always" : "Long day at the garage."));
  await openRoute(page, "/worlds");
  await page.evaluate(async ({ aria, kai }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const os = db.transaction("characters", "readwrite").objectStore("characters");
      const get = os.get(aria);
      get.onsuccess = () => {
        os.put({ ...get.result, knowsAbout: [kai], postsStatuses: true });
        os.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, { aria: ARIA.id, kai: KAI.id });
  await page.reload();
  await page.getByRole("button", { name: "Simulate a day" }).click();
  const dialog = page.getByRole("dialog", { name: "Simulate a day" });
  await expect(dialog).toContainText("at the very most");
  await dialog.getByRole("button", { name: "Simulate a day" }).click();
  await expect(page.getByText("A day went by")).toBeVisible({ timeout: 30_000 });
  const asked = mockAI.requests.map((r) => r.prompt);
  expect(asked.some((p) => p.includes("Write a text conversation between"))).toBe(true);
  expect(asked.some((p) => p.includes("Write one short status update"))).toBe(true);
});
