import { test, expect, openRoute, ARIA } from "./fixtures";

// Reset (#158): a character forgets everything that built up and keeps
// their card; a world loses its progress, its people with it if you ask.

test.use({ seed: { messages: 4 } });

const db = (page: import("@playwright/test").Page, store: "characters" | "chats", id: number, patch?: Record<string, unknown>) =>
  page.evaluate(async ({ store, id, patch }) => {
    const conn: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const row: any = await new Promise((resolve) => {
      const tx = conn.transaction(store, "readwrite");
      const get = tx.objectStore(store).get(id);
      get.onsuccess = () => {
        if (patch) tx.objectStore(store).put({ ...get.result, ...patch });
        tx.oncomplete = () => resolve(get.result);
      };
    });
    conn.close();
    return row;
  }, { store, id, patch });

test("resetting a character clears what built up and keeps the card and messages", async ({ page }) => {
  await openRoute(page, "/");
  await expect(page.getByRole("link", { name: /^AR Aria/ })).toBeVisible({ timeout: 30_000 });
  await db(page, "characters", ARIA.id, { memory: ["You like tea"], diary: [{ at: 1, text: "Dear diary" }], gifts: [{ id: "g", what: "a mug", at: 1, from: "you" }], relationship: "Close friend", relationshipHistory: [{ from: "New Friend", to: "Close friend", at: 1 }] });
  await db(page, "chats", 1, { memory: ["Chat fact"], stage: "dating" });
  await page.reload();

  await openRoute(page, "/characters");
  await page.getByRole("button", { name: "More options for Aria" }).first().click();
  await page.getByRole("menuitem", { name: "Reset..." }).click();
  const dialog = page.getByRole("dialog", { name: "Reset Aria?" });
  await expect(dialog).toContainText("This can't be undone.");
  await dialog.getByRole("button", { name: "Reset" }).click();
  await expect(dialog).toHaveCount(0);

  await expect.poll(async () => (await db(page, "characters", ARIA.id)).memory).toBeUndefined();
  const aria = await db(page, "characters", ARIA.id);
  expect(aria).toMatchObject({ name: "Aria", prompt: ARIA.prompt, relationship: "New Friend" });
  expect(aria.diary).toBeUndefined();
  expect(aria.gifts).toBeUndefined();
  const chat = await db(page, "chats", 1);
  expect(chat.memory).toBeUndefined();
  expect(chat.stage).toBeUndefined();
  expect(chat.content.length).toBeGreaterThan(0);
});

test("resetting a world resets its people, and can delete its chats", async ({ page }) => {
  await openRoute(page, "/");
  await expect(page.getByRole("link", { name: /^AR Aria/ })).toBeVisible({ timeout: 30_000 });
  await db(page, "characters", ARIA.id, { memory: ["You like tea"] });
  await page.reload();
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Reset Default" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset Default?" });
  await dialog.getByLabel("Also delete your chats here").click();
  await dialog.getByRole("button", { name: "Reset" }).click();
  await expect.poll(async () => (await db(page, "characters", ARIA.id)).memory).toBeUndefined();
  await openRoute(page, "/");
  await expect(page.getByRole("link", { name: /^AR Aria/ })).toHaveCount(0);
});
