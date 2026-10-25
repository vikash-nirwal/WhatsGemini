import { test, expect, openChat, openRoute, openContactInfo } from "./fixtures";
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

// A 1:1 chat's memory is about the character, in Contact info (#151).
const openScene = (page: Page) => openContactInfo(page);

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
    await expect(page.locator('[data-slot="side-panel"]').getByText(heading, { exact: true })).toBeVisible();
  }

  // "Arin collects maps." is unsorted; one click moves it to About you.
  await page.getByText("Arin collects maps.").locator("..").getByRole("button", { name: /Change group/ }).click();
  await expect(page.locator('[data-slot="side-panel"]').getByText("Other", { exact: true })).toBeHidden();

  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await openScene(page);
  await expect(page.getByText("Arin collects maps.")).toBeVisible();
  await expect(page.locator('[data-slot="side-panel"]').getByText("Other", { exact: true })).toBeHidden();
});

test("an unsorted memory stays one plain list", async ({ page }) => {
  await openChat(page);
  await writeMemory(page, ["Arin hates rain.", "Arin collects maps."]);
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await openScene(page);
  await expect(page.getByText("Arin hates rain.")).toBeVisible();
  await expect(page.getByText("About you", { exact: true })).toBeHidden();
  await expect(page.locator('[data-slot="side-panel"]').getByText("Other", { exact: true })).toBeHidden();
});

const readCharacterMemory = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const character: { memory?: string[] } = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").get(1);
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return character.memory || [];
  });

test("a chat can keep its own memory without touching the character's", async ({ page }) => {
  await openChat(page);
  await writeMemory(page, ["Arin hates rain."]);
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await openScene(page);

  await page.getByRole("button", { name: "This chat only" }).click();
  await expect(page.getByText(/New facts stay in this chat/)).toBeVisible();
  // It starts as a copy, so the backstory is still known here.
  await expect(page.getByText("Arin hates rain.")).toBeVisible();

  await page.getByRole("button", { name: "Add a memory fact" }).click();
  const input = page.getByPlaceholder("A fact to remember…");
  await input.fill("In this timeline, Arin is a pirate.");
  await input.press("Enter");
  await expect(page.getByText("In this timeline, Arin is a pirate.")).toBeVisible();

  // The character's own memory is untouched.
  expect(await readCharacterMemory(page)).toEqual(["Arin hates rain."]);

  // Switching back shows the shared memory again.
  await page.getByRole("button", { name: "Shared with Aria" }).click();
  await expect(page.getByText("In this timeline, Arin is a pirate.")).toBeHidden();
  await expect(page.getByText("Arin hates rain.")).toBeVisible();
});

test("the character editor's memory card groups facts the same way", async ({ page }) => {
  // Opening a route seeds the database again, so the editor opens first.
  await openRoute(page, `/characters/1/edit`);
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  await writeMemory(page, ["Arin hates rain.", "The inn burned down.", "Arin collects maps."], {
    "Arin hates rain.": "user",
    "The inn burned down.": "story",
  });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("group", { name: "About you" })).toContainText("Arin hates rain.");
  await expect(page.getByRole("group", { name: "Story" })).toContainText("The inn burned down.");
  const other = page.getByRole("group", { name: "Other" });
  await expect(other).toContainText("Arin collects maps.");
  // Its tag moves it into the first group.
  await other.getByRole("button", { name: "Change group (now Unsorted)" }).click();
  await expect(page.getByRole("group", { name: "About you" })).toContainText("Arin collects maps.");
  await expect(page.getByRole("group", { name: "Other" })).toHaveCount(0);
});
