import { test, expect, openRoute } from "./fixtures";

// Quick create (#154): a line gives a draft preview with a life preset, and
// "Start chatting" saves it and opens the chat; the full editor opens with
// the draft filled in.

test.use({ seed: { messages: 2 } });

const DRAFT = { name: "Inês Moura", description: "Owner of a record shop", personalityTraits: ["gruff", "secretly kind"], prompt: "You are Inês, gruff and secretly kind.", first_message: "We close at seven.", relationship: "Regular customer" };

const saved = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows: any[] = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").getAll();
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return rows.find((c) => c.name === "Inês Moura");
  });

test("a line becomes a draft, picks a life, and starts a chat", async ({ page, mockAI }) => {
  mockAI.reply(JSON.stringify(DRAFT));
  await openRoute(page, "/characters");
  await page.getByRole("button", { name: "New character" }).first().click();
  await expect(page).toHaveURL(/#\/characters\/quick$/);
  await page.getByLabel("Describe them in a line").fill("A retired singer who runs a record shop");
  await page.getByRole("button", { name: "Draft" }).click();
  const preview = page.getByRole("region", { name: "Draft preview" });
  await expect(preview).toContainText("Inês Moura");
  await expect(preview).toContainText("We close at seven.");
  await expect(preview.getByRole("radio", { name: "Realistic texter" })).toHaveAttribute("aria-checked", "true");
  await preview.getByRole("radio", { name: "Storyteller" }).click();
  await page.getByRole("button", { name: "Start chatting with Inês Moura" }).click();
  await expect(page).toHaveURL(/#\/chat\/\d+$/);
  await expect(page.getByLabel("Message input")).toBeVisible();
  expect(await saved(page)).toMatchObject({ name: "Inês Moura", diaryEnabled: true, dreams: true, writesLetters: true, innerThoughts: true });
});

test("the full editor opens with the draft filled in", async ({ page, mockAI }) => {
  mockAI.reply(JSON.stringify(DRAFT));
  await openRoute(page, "/characters/quick");
  await page.getByLabel("Describe them in a line").fill("A retired singer");
  await page.getByRole("button", { name: "Draft" }).click();
  await expect(page.getByRole("region", { name: "Draft preview" })).toContainText("Inês Moura");
  await page.getByRole("button", { name: "Full editor" }).click();
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Inês Moura");
});
