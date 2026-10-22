import type { Page } from "@playwright/test";
import { test, expect, openChat, messageBubble, headerAction, sendMessage, waitForReplyDone, ARIA } from "./fixtures";

// Gifts (#82): give the character something; they react and remember it,
// and on a special date they may give you something back.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

const db = <T,>(page: Page, fn: string, arg: unknown) =>
  page.evaluate(
    async ({ fn, arg }) => {
      const open: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      // eslint-disable-next-line no-new-func
      const result = await new Function("db", "arg", fn)(open, arg);
      open.close();
      return result;
    },
    { fn, arg }
  ) as Promise<T>;

const readAria = (page: Page) =>
  db<any>(page, `return new Promise((resolve) => { const get = db.transaction("characters").objectStore("characters").get(arg); get.onsuccess = () => resolve(get.result); });`, ARIA.id);

const patchAria = (page: Page, fields: Record<string, unknown>) =>
  db(page, `return new Promise((resolve) => { const tx = db.transaction("characters", "readwrite"); const store = tx.objectStore("characters"); const get = store.get(arg.id); get.onsuccess = () => store.put({ ...get.result, ...arg.fields }); tx.oncomplete = () => resolve(); });`, { id: ARIA.id, fields });

test("give a gift: it shows in the chat, Aria reacts, and remembers it", async ({ page, mockAI }) => {
  mockAI.reply("*gasps* Flowers? For me? They're beautiful.");
  await openChat(page);
  await headerAction(page, "Give Aria a gift");
  const dialog = page.getByRole("dialog", { name: "Give Aria a gift" });
  await expect(dialog.getByText("Nothing yet, either way.")).toBeVisible();
  await dialog.getByRole("group", { name: "Gift ideas" }).getByRole("button", { name: "Flowers" }).click();
  await expect(dialog).toBeHidden();

  await expect(messageBubble(page, "gives you flowers")).toBeVisible();
  await expect(messageBubble(page, "They're beautiful.")).toBeVisible();
  await waitForReplyDone(page);
  expect(systemOf(mockAI.requests[0].messages)).toContain("just gave you a gift: flowers");
  await expect.poll(async () => (await readAria(page)).gifts).toEqual([expect.objectContaining({ what: "Flowers", from: "you" })]);

  // The next reply remembers it.
  await sendMessage(page, "I'm glad you like them.");
  await waitForReplyDone(page);
  await expect.poll(() => mockAI.requests.length).toBe(2);
  expect(systemOf(mockAI.requests[1].messages)).toContain("gave you flowers");

  // And it's in the Given list.
  await headerAction(page, "Give Aria a gift");
  await expect(page.getByRole("region", { name: "Given" })).toContainText("You gave Flowers");
});

test("a gift in your own words", async ({ page, mockAI }) => {
  mockAI.reply("A snow globe! I'll keep it on my desk.");
  await openChat(page);
  await headerAction(page, "Give Aria a gift");
  const dialog = page.getByRole("dialog", { name: "Give Aria a gift" });
  await dialog.getByRole("textbox", { name: "Your own gift" }).fill("A snow globe from Paris");
  await dialog.getByRole("button", { name: "Give" }).click();
  await expect(messageBubble(page, "gives you a snow globe from Paris")).toBeVisible();
});

test("on a special date, Aria gives you something back", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.includes("wants to give") ? "A star map of the night we met" : "Happy birthday! I made you something."));
  await openChat(page);
  const today = new Date();
  await patchAria(page, {
    importantDates: [{ id: "d1", label: "Your birthday", month: today.getMonth() + 1, day: today.getDate(), messageOnDay: true }],
    gifts: [{ id: "g1", what: "Flowers", at: Date.now() - 86_400_000, from: "you" }],
  });
  await page.reload();

  await expect(messageBubble(page, "Happy birthday!")).toBeVisible({ timeout: 30_000 });
  const celebration = mockAI.requests.find((r) => systemOf(r.messages).includes("Today is your birthday"))!;
  expect(JSON.stringify(celebration.messages)).toContain("You're also giving them a gift: A star map of the night we met");
  await expect.poll(async () => (await readAria(page)).gifts?.map((g: any) => [g.from, g.what])).toEqual([["you", "Flowers"], ["character", "A star map of the night we met"]]);
});
