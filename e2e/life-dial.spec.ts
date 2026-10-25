import type { Page } from "@playwright/test";
import { test, expect, openChat, ARIA } from "./fixtures";

// Life dial and activity log (#131): background jobs note what they did in
// Settings > Spending's activity log, and the dial is kept.

test.use({ seed: { messages: 4 } });

const patchAria = (page: Page, fields: Record<string, unknown>) =>
  page.evaluate(
    async ({ id, fields }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve) => {
        const store = db.transaction("characters", "readwrite").objectStore("characters");
        const get = store.get(id);
        get.onsuccess = () => {
          store.put({ ...get.result, ...fields });
          store.transaction.oncomplete = () => resolve();
        };
      });
      db.close();
    },
    { id: ARIA.id, fields }
  );

test("a status post shows in the activity log, and the life dial is kept", async ({ page, mockAI }) => {
  await page.clock.install();
  mockAI.reply("Rainy shift, cozy cafe ☔");
  await openChat(page);
  await patchAria(page, { postsStatuses: true });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await page.clock.fastForward(20_000);
  await expect.poll(() => mockAI.requests.length, { timeout: 15_000 }).toBeGreaterThan(0);

  await page.goto("./#/settings/spending");
  const log = page.getByRole("list", { name: "Activity log" });
  await expect(log.getByText("Aria posted a status")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("activity-today")).toContainText("background call");

  const dial = page.getByRole("group", { name: "Life dial" });
  await dial.getByRole("button", { name: "Quiet" }).click();
  await page.reload();
  await expect(page.getByRole("group", { name: "Life dial" }).getByRole("button", { name: "Quiet" })).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
});
