import { test, expect, openRoute, editorStep } from "./fixtures";

// A character's picture from your own photo (2026-10-28): "Upload a picture"
// on the first step, cropped, and kept in the app when no Image Save
// Directory is picked - as on phones and Safari, which can't pick one.

test.use({ seed: false });

// A 2x3 PNG, so it's tall like a portrait.
const PHOTO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEklEQVR4nGP4z8DAwMDAxMAAAAwbAQMbm1rKAAAAAElFTkSuQmCC", "base64");

test("a picture uploaded on the first step becomes theirs, with no save folder", async ({ page }) => {
  await openRoute(page, "/characters/new");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("main-photo-input").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PHOTO });
  await page.getByRole("button", { name: "Apply Crop" }).click();
  await expect(page.getByRole("img", { name: "Portrait" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload a new picture" })).toBeVisible();

  await page.getByRole("textbox", { name: "Character Name" }).fill("Nell");
  await editorStep(page, "Personality");
  await page.getByRole("textbox", { name: "Character Prompt (Personality, Style, etc.)" }).fill("You are Nell, a cheerful map-maker.");
  await editorStep(page, "Test and finish");
  await page.getByRole("button", { name: "Create Character" }).click();
  await expect(page).toHaveURL(/#\/characters$/);

  const saved = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const all: any[] = await new Promise((r) => { const g = db.transaction("characters").objectStore("characters").getAll(); g.onsuccess = () => r(g.result); });
    db.close();
    return all.find((c) => c.name === "Nell")?.appearanceImages;
  });
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatch(/^data:image\/(png|jpeg);base64,/);
});
