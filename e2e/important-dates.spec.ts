import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, messageBubble, ARIA, openDetails } from "./fixtures";

// Dates that matter (#47): set in the character editor (or found in memory),
// and on the day the character messages first, once.

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

const openDates = async (page: Page) => {
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next" }).click();
  const section = page.locator("details").filter({ has: page.locator("summary", { hasText: "Dates that matter" }) });
  await openDetails(section);
  return section;
};

test("a date is added in the editor and saved", async ({ page }) => {
  await openRoute(page, `/characters/${ARIA.id}/edit`);
  const section = await openDates(page);
  await section.getByRole("button", { name: "Add a date" }).click();
  await section.getByLabel("What the date is").fill("Your birthday");
  await section.getByRole("combobox", { name: "Month" }).click();
  await page.getByRole("option", { name: "July" }).click();
  await section.getByLabel("Day", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();
  expect((await readAria(page)).importantDates).toEqual([expect.objectContaining({ label: "Your birthday", month: 7, day: 12, messageOnDay: true })]);
});

test("dates are found in the character's memory", async ({ page, mockAI }) => {
  await openRoute(page, `/characters/${ARIA.id}/edit`);
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  await patchAria(page, { memory: ["The user's birthday is March 4th.", "The user likes jazz."] });
  await page.reload();
  mockAI.reply('[{"label": "Your birthday", "month": 3, "day": 4}]');
  const section = await openDates(page);
  await section.getByRole("button", { name: "Find dates in memory" }).click();
  await expect(section.getByRole("status")).toHaveText("Found 1.");
  await expect(section.getByLabel("What the date is")).toHaveValue("Your birthday");
  expect(mockAI.requests[0].prompt).toContain("The user's birthday is March 4th.");
});

test("on the day, the character messages first, once", async ({ page, mockAI }) => {
  mockAI.reply("Happy birthday!! I've been waiting all day to say it.");
  await openChat(page);
  const today = new Date();
  await patchAria(page, { importantDates: [{ id: "d1", label: "Your birthday", month: today.getMonth() + 1, day: today.getDate(), messageOnDay: true }] });
  await page.reload();

  await expect(messageBubble(page, "Happy birthday!!")).toBeVisible({ timeout: 30_000 });
  const request = mockAI.requests[0];
  expect(JSON.stringify(request.messages)).toContain("Today is your birthday. Reach out first about it");
  await expect.poll(async () => (await readAria(page)).importantDates[0].lastCelebratedYear).toBe(today.getFullYear());

  // Reopening the same day doesn't send it again.
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  expect(mockAI.requests).toHaveLength(1);
});
