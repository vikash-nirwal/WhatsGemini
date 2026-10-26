import type { Page } from "@playwright/test";
import { readFileSync } from "fs";
import { test, expect, openRoute, ARIA, KAI } from "./fixtures";

// World export and import (#172): a world and its people as one file,
// without anything they lived; importing it makes a fresh copy.

test.use({ seed: { messages: 2, room: true } });

const patch = (page: Page, id: number, change: Record<string, unknown>) =>
  page.evaluate(async ({ id, change }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const os = db.transaction("characters", "readwrite").objectStore("characters");
      const get = os.get(id);
      get.onsuccess = () => {
        os.put({ ...get.result, ...change });
        os.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, { id, change });

const charactersInDb = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all: any[] = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").getAll();
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return all;
  });

test("export a world with its people, and import it as a fresh copy", async ({ page }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await patch(page, ARIA.id, { worldId: 1, ties: [{ withId: KAI.id, tie: "your brother" }], memory: ["Sam is afraid of boats"] });
  await patch(page, KAI.id, { worldId: 1, ties: [{ withId: ARIA.id, tie: "your sister" }] });
  await page.reload();
  await openRoute(page, "/worlds");

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Harbour Town" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("harbour-town.world.json");
  const text = readFileSync((await download.path())!, "utf8");
  const file = JSON.parse(text);
  expect(file.cast.map((c: any) => c.name).sort()).toEqual(["Aria", "Kai"]);
  expect(text).not.toContain("afraid of boats");

  await page.getByLabel("Import a world file").setInputFiles({ name: "harbour-town.world.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(page.getByText("Harbour Town imported, with its people")).toBeVisible();
  await expect.poll(async () => (await charactersInDb(page)).filter((c) => c.worldId === 2).map((c) => c.name).sort()).toEqual(["Aria", "Kai"]);
  const copies = (await charactersInDb(page)).filter((c) => c.worldId === 2);
  const aria = copies.find((c) => c.name === "Aria");
  const kai = copies.find((c) => c.name === "Kai");
  expect(aria.ties).toEqual([{ withId: kai.id, tie: "your brother" }]);
  expect(aria.memory).toBeUndefined();
});

// #197: a world shared as a link (and a QR code), opened from the link.
test("share a world as a link and open it", async ({ page }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await patch(page, ARIA.id, { worldId: 1 });
  await page.reload();
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Share Harbour Town" }).click();
  const dialog = page.getByRole("dialog", { name: "Share Harbour Town" });
  const field = dialog.getByRole("textbox", { name: "Share link" });
  await expect(field).toHaveValue(/#\/worlds\/import\?w=/);
  await expect(dialog.getByRole("img", { name: "QR code for Harbour Town" })).toBeVisible();
  const link = await field.inputValue();
  await page.keyboard.press("Escape");

  await page.goto(link);
  const shared = page.getByRole("region", { name: "Shared world" });
  await expect(shared).toContainText("Harbour Town", { timeout: 30_000 });
  await expect(shared).toContainText("1 person: Aria");
  await shared.getByRole("button", { name: "Import this world" }).click();
  await expect(page.getByText("Harbour Town imported, with its people")).toBeVisible();
  await expect.poll(async () => (await charactersInDb(page)).filter((c) => c.worldId === 2).map((c) => c.name)).toEqual(["Aria"]);
});
