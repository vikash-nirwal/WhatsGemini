import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, ARIA } from "./fixtures";

// Helper replies (#214): with the switch on, background helpers' replies are
// kept on this device, and "Check them" runs the parsers over them.

test.use({ seed: { messages: 4 } });

const putSetting = (page: Page, key: string, value: unknown) =>
  page.evaluate(
    async ({ key, value }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("settings", "readwrite");
        tx.objectStore("settings").put({ key, value });
        tx.oncomplete = () => resolve();
      });
      db.close();
    },
    { key, value }
  );

test("kept replies are checked against the parsers, and cleared", async ({ page }) => {
  await openRoute(page, "/settings/spending");
  const keep = page.getByRole("switch", { name: "Keep helper replies" });
  await expect(keep).not.toBeChecked();
  await keep.click();
  await putSetting(page, "reply_log", [
    { at: 1, kind: "world-talk", instruction: "Write a text conversation between Kai and Mira, who know each other.\nTIE: <x> | <y>", reply: "Kai: hey\nMira: hi\nTIE:" },
    { at: 2, kind: "goal", instruction: "What does Kai want this week?", reply: "Kai wants to buy the old boat before Saturday." },
  ]);
  await page.reload();
  await expect(page.getByRole("switch", { name: "Keep helper replies" })).toBeChecked({ timeout: 30_000 });
  await expect(page.getByTestId("helper-replies-count")).toHaveText("2 replies kept");

  await page.getByRole("button", { name: "Check them" }).click();
  const table = page.getByRole("table", { name: "Helper reply check" });
  await expect(table.getByRole("row", { name: /World talk \(1\) Name: text lines/ })).toContainText("1");
  await expect(table.getByRole("row", { name: /TIE: x \| y/ }).getByRole("cell").last()).toHaveText("1");
  await expect(table.getByText("Goal for the week (1)")).toBeVisible();

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("helper-replies-count")).toHaveText("0 replies kept");
  await expect(table).toBeHidden();
});

test("a background reply is kept while the switch is on", async ({ page, mockAI }) => {
  await page.clock.install();
  mockAI.reply("Rainy shift, cozy cafe");
  await openChat(page);
  await page.evaluate(() => localStorage.setItem("reply_log_on", "true"));
  await page.evaluate(
    async ({ id }) => {
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
    },
    { id: ARIA.id }
  );
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await page.clock.fastForward(20_000);
  await expect.poll(() => mockAI.requests.length, { timeout: 15_000 }).toBeGreaterThan(0);

  await page.goto("./#/settings/spending");
  await expect(page.getByTestId("helper-replies-count")).not.toHaveText("0 replies kept", { timeout: 30_000 });
  await page.getByRole("button", { name: "Check them" }).click();
  await expect(page.getByText(/Not checked \(nothing parses them\): status/)).toBeVisible();
});
