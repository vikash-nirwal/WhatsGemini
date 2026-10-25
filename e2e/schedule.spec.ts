import { editorStep } from "./fixtures";
import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, sendMessage, messageBubble, ARIA, openDetails } from "./fixtures";

// Character schedule and presence (#7): a daily routine shown in the chat
// header, known to the character, and (when realistic) holding replies back
// a little while they're busy.

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

const ALL_DAY_WORK = { blocks: [{ start: 0, end: 24, activity: "at work", status: "busy" }] };

test("a routine is started from a typical day in the editor and saved", async ({ page }) => {
  await openRoute(page, `/characters/${ARIA.id}/edit`);
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  await editorStep(page, "World and story");
  const section = page.locator("details").filter({ has: page.locator("summary", { hasText: "Daily routine" }) });
  // Retried until it's really open: a click while the step is still
  // settling can be lost.
  await expect(async () => {
    if ((await section.getAttribute("open")) === null) await openDetails(section);
    await expect(section).toHaveAttribute("open", "", { timeout: 1000 });
  }).toPass();
  await section.getByRole("button", { name: "Start from a typical day" }).click();
  await expect(section.locator("summary").first()).toContainText("5 parts of the day");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();
  const blocks = await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((resolve) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
    });
    const c: any = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").get(id);
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return c.schedule?.blocks?.length;
  }, ARIA.id);
  expect(blocks).toBe(5);
});

test("the header shows what they're doing, and the character knows it", async ({ page, mockAI }) => {
  mockAI.reply("Ugh, still at the office. What's up?");
  await openChat(page);
  await patchAria(page, { schedule: ALL_DAY_WORK });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("header").first()).toContainText("at work");

  await sendMessage(page, "Hey!");
  await expect.poll(() => mockAI.requests.length).toBe(1);
  const system = mockAI.requests[0].messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("Right now you're at work. You're busy right now");
});

test("a realistic routine holds the reply back while they're busy", async ({ page, mockAI }) => {
  await page.clock.install();
  mockAI.reply("Sorry, just saw this!");
  await openChat(page);
  await patchAria(page, { schedule: { ...ALL_DAY_WORK, realistic: true } });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await sendMessage(page, "Are you free?");
  await expect(page.getByText("Aria is at work and will reply in a bit")).toBeVisible();
  expect(mockAI.requests).toHaveLength(0);
  await page.clock.fastForward(60_000);
  await expect(messageBubble(page, "Sorry, just saw this!")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Aria is at work and will reply in a bit")).toHaveCount(0);
});
