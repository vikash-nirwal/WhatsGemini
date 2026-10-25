import { test, expect, openRoute, openChat, openDetails } from "./fixtures";
import type { Page } from "@playwright/test";

// Consistent looks (#34, #35): the locked look is drafted, edited and saved
// in the character editor, reaches every image request, and the main
// reference can be chosen.

test.use({ seed: { messages: 4 } });

const TAGS = "early 20s, slim, pale skin, long silver hair, violet almond-shaped eyes, small scar over left eyebrow";
// A 1x1 PNG, enough to stand in for a reference photo.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const patchCharacter = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate(async (fields) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("characters", "readwrite");
      const store = tx.objectStore("characters");
      const get = store.get(1);
      get.onsuccess = () => store.put({ ...get.result, ...fields });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, patch);

const readCharacter = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const c: any = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").get(1);
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return c;
  });

test("draft the locked look from the appearance, edit it and save it", async ({ page, mockAI }) => {
  mockAI.reply(`Visual traits: ${TAGS}`);
  await openRoute(page, "/characters/1/edit");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  await page.getByPlaceholder(/Character Appearance/).fill("A pale young elf with long silver hair and violet eyes, scar over her left brow.");
  await page.getByRole("button", { name: /Draft from appearance/ }).click();
  const field = page.getByLabel("Locked look for pictures");
  await expect(field).toHaveValue(TAGS);
  await field.fill(`${TAGS}, dark blue cloak`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();
  expect((await readCharacter(page)).visualTags).toBe(`${TAGS}, dark blue cloak`);
});

test("the main reference can be changed", async ({ page }) => {
  await openRoute(page, "/characters/1/edit");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  await patchCharacter(page, { appearanceImages: [PIXEL, `${PIXEL}#second`] });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  await expect(page.getByText("Main", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Make reference 2 the main reference" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();
  expect((await readCharacter(page)).appearanceImages).toEqual([`${PIXEL}#second`, PIXEL]);
});

test("a chat picture request carries the locked look word for word", async ({ page, mockAI }) => {
  mockAI.reply("PROMPT:\na silver-haired girl at a cafe\n\nSUMMARY:\nHere you go!");
  await openChat(page, 1);
  await patchCharacter(page, { visualTags: TAGS });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  // #149: asking for an image is in the composer's "+" menu at every width.
  await page.getByRole("button", { name: "Composer options" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Request an image with this message" }).click();
  await page.getByLabel("Message input").fill("Send me a picture of you!");
  await page.getByRole("button", { name: "Send Message" }).click();

  // The prompt-writing request names the locked look; the image provider
  // isn't configured in tests, so the check stops at what was asked for.
  await expect.poll(() => mockAI.requests.some((r) => r.prompt.includes("word for word") && r.prompt.includes(TAGS))).toBe(true);
});

test("local image settings are saved with the character", async ({ page }) => {
  await openRoute(page, "/characters/1/edit");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next" }).click();
  const section = page.locator("details").filter({ has: page.locator("summary", { hasText: "Local image settings" }) });
  await openDetails(section);
  await section.getByLabel("Seed").fill("1234");
  await section.getByLabel("LoRA file name").fill("aria_v1");
  await section.getByLabel("LoRA trigger word").fill("aria_char");
  await section.getByRole("combobox", { name: "How reference photos are used" }).click();
  await page.getByRole("option", { name: "ReActor face swap" }).click();
  await expect(section.locator("summary").first()).toContainText("LoRA aria_v1, seed 1234");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();
  expect((await readCharacter(page)).localImageSettings).toEqual({ seed: 1234, loraName: "aria_v1", loraTrigger: "aria_char", referenceMode: "reactor" });
});
