import { test, expect, openChat, ARIA } from "./fixtures";

// While you were away (#130): after hours closed, a character with statuses
// on posts one "back then", and the chat list says so.

test.use({ seed: { messages: 4 } });

test("after hours away, a status is filled in back then and summed up", async ({ page, mockAI }) => {
  mockAI.reply("Long night at the garage.");
  await openChat(page);
  // Statuses on, and the app last seen five hours ago.
  await page.evaluate(async ({ id }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const store = db.transaction("characters", "readwrite").objectStore("characters");
      const get = store.get(id);
      get.onsuccess = () => {
        store.put({ ...get.result, postsStatuses: true });
        store.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, { id: ARIA.id });
  // Set as the next page starts: leaving this one saves "last seen" (now).
  await page.addInitScript(() => {
    if (sessionStorage.getItem("away-set")) return;
    sessionStorage.setItem("away-set", "1");
    localStorage.setItem("app_last_seen", String(Date.now() - 5 * 60 * 60 * 1000));
  });
  await page.goto("./#/");
  await page.reload();

  const card = page.getByRole("region", { name: "While you were away" });
  await expect(card).toContainText("Aria posted a status", { timeout: 40_000 });
  // Stamped back then, not now.
  const createdAt = await page.evaluate(async ({ id }) => {
    const db: IDBDatabase = await new Promise((resolve) => { const req = indexedDB.open("ChatAppDB"); req.onsuccess = () => resolve(req.result); });
    const row: any = await new Promise((resolve) => { const get = db.transaction("characters").objectStore("characters").get(id); get.onsuccess = () => resolve(get.result); });
    db.close();
    return row.statuses[row.statuses.length - 1].createdAt;
  }, { id: ARIA.id });
  expect(Date.now() - createdAt).toBeGreaterThan(60 * 60 * 1000);
  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(card).toHaveCount(0);
});
