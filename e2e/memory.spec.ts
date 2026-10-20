import { test, expect, openChat } from "./fixtures";
import type { Page } from "@playwright/test";

// Long-term memory in the Scene panel: facts grouped by what they're about
// (#3), and a fact's group can be changed by hand and survives a reload.

const writeMemory = (page: Page, memory: string[], memoryCategories?: Record<string, string>) =>
  page.evaluate(async ({ memory, memoryCategories }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("characters", "readwrite");
      const store = tx.objectStore("characters");
      const get = store.get(1);
      get.onsuccess = () => store.put({ ...get.result, memory, memoryCategories });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { memory, memoryCategories });

const openScene = async (page: Page) => {
  const direct = page.getByRole("button", { name: "Scene & chat settings" });
  if (await direct.isVisible()) {
    await direct.click();
  } else {
    // Narrow headers keep their actions in the "more" menu.
    await page.getByRole("button", { name: /more/i }).last().click();
    await page.getByRole("menuitem", { name: "Scene & chat settings" }).click();
  }
};

test("memory is grouped by category and a fact's group can be changed", async ({ page }) => {
  await openChat(page);
  await writeMemory(page, ["Arin hates rain.", "Mira trusts Arin.", "The inn burned down.", "Arin collects maps."], {
    "Arin hates rain.": "user",
    "Mira trusts Arin.": "relationship",
    "The inn burned down.": "story",
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await openScene(page);

  for (const heading of ["About you", "Relationship", "Story", "Other"]) {
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
  }

  // "Arin collects maps." is unsorted; one click moves it to About you.
  await page.getByText("Arin collects maps.").locator("..").getByRole("button", { name: /Change group/ }).click();
  await expect(page.getByText("Other", { exact: true })).toBeHidden();

  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await openScene(page);
  await expect(page.getByText("Arin collects maps.")).toBeVisible();
  await expect(page.getByText("Other", { exact: true })).toBeHidden();
});

test("an unsorted memory stays one plain list", async ({ page }) => {
  await openChat(page);
  await writeMemory(page, ["Arin hates rain.", "Arin collects maps."]);
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await openScene(page);
  await expect(page.getByText("Arin hates rain.")).toBeVisible();
  await expect(page.getByText("About you", { exact: true })).toBeHidden();
  await expect(page.getByText("Other", { exact: true })).toBeHidden();
});
