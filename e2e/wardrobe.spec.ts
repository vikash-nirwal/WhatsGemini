import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, headerAction, sendMessage, ARIA, openDetails, openContactInfo } from "./fixtures";

// Wardrobe (#50): named outfits; the one being worn goes into pictures after
// the locked look, and the character knows what they have on.

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
        const tx = db.transaction("characters", "readwrite");
        const store = tx.objectStore("characters");
        const get = store.get(id);
        get.onsuccess = () => store.put({ ...get.result, ...fields });
        tx.oncomplete = () => resolve();
      });
      db.close();
    },
    { id: ARIA.id, fields }
  );

const readAria = (page: Page) =>
  page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const c: any = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").get(id);
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return c;
  }, ARIA.id);

const WARDROBE = [
  { id: "work", name: "Work clothes", description: "charcoal blazer, white shirt" },
  { id: "gym", name: "Gym", description: "black running top, grey shorts" },
];

test("outfits are added in the editor, and one is worn", async ({ page }) => {
  await openRoute(page, `/characters/${ARIA.id}/edit`);
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next" }).click();
  const section = page.locator("details").filter({ has: page.locator("summary", { hasText: "Wardrobe" }) });
  await openDetails(section);
  await section.getByRole("button", { name: "Add an outfit" }).click();
  await section.getByLabel("Outfit name").fill("Work clothes");
  await section.getByLabel("What it looks like").fill("charcoal blazer, white shirt");
  await section.getByRole("button", { name: "Wear" }).click();
  await expect(section.locator("summary").first()).toContainText("wearing Work clothes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();
  const aria = await readAria(page);
  expect(aria.wardrobe).toEqual([expect.objectContaining({ name: "Work clothes", description: "charcoal blazer, white shirt" })]);
  expect(aria.currentOutfitId).toBe(aria.wardrobe[0].id);
});

test("the worn outfit reaches the prompt and pictures, and is switched in the Scene panel", async ({ page, mockAI }) => {
  await openChat(page);
  await patchAria(page, { visualTags: "silver hair, violet eyes", wardrobe: WARDROBE, currentOutfitId: "work" });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  mockAI.reply("PROMPT:\nAria at her desk\n\nSUMMARY:\nHere I am at work!");
  await sendMessage(page, "/image you at work");
  // The in-character call knows the outfit; the prompt-writing call gets the locked look with it.
  await expect.poll(() => mockAI.requests.length).toBeGreaterThan(1);
  expect(JSON.stringify(mockAI.requests[0].messages)).toContain("What you're wearing right now: Work clothes (charcoal blazer, white shirt)");
  expect(mockAI.requests[1].prompt).toContain("silver hair, violet eyes; outfit: charcoal blazer, white shirt");

  await openContactInfo(page);
  const outfit = page.getByRole("combobox", { name: "Aria's outfit" });
  await expect(outfit).toHaveText(/Work clothes/);
  await outfit.click();
  await page.getByRole("option", { name: "Gym" }).click();
  await expect.poll(async () => (await readAria(page)).currentOutfitId).toBe("gym");
});
