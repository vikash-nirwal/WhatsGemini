import { test, expect, openRoute, openChat, sendMessage, waitForReplyDone, ARIA, KAI } from "./fixtures";

// Life inside a world (#145): two characters who know each other text on
// their own; Peek (off by default) shows the thread read-only, and the next
// reply knows about it.

test.use({ seed: { messages: 4, room: true } });

const TALK = "Aria: you up?\nKai: always. engine trouble again?\nAria: harbour at 6, bring coffee";

const patchCharacter = (page: import("@playwright/test").Page, id: number, patch: Record<string, unknown>) =>
  page.evaluate(async ({ id, patch }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const store = db.transaction("characters", "readwrite").objectStore("characters");
      const get = store.get(id);
      get.onsuccess = () => {
        store.put({ ...get.result, ...patch });
        store.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, { id, patch });

const talksInDb = (page: import("@playwright/test").Page) =>
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
    return c.talks || [];
  }, ARIA.id);

test("characters who know each other text on their own, and Peek shows it", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 10, 0, 0) });
  mockAI.reply((req) => (req.prompt.includes("Write a text conversation between") ? TALK : "Mock reply"));
  await openRoute(page, "/");
  await expect(page.getByRole("link", { name: /^AR Aria/ })).toBeVisible({ timeout: 30_000 });
  await patchCharacter(page, ARIA.id, { knowsAbout: [KAI.id] });
  await page.reload();
  await page.clock.fastForward(40_000);
  await expect.poll(() => talksInDb(page), { timeout: 15_000 }).toHaveLength(1);
  const ask = mockAI.requests.find((r) => r.prompt.includes("Write a text conversation between"))!.prompt;
  expect(ask).toContain("between Aria and Kai");
  expect(ask).toContain("2 to 10 short texts");

  // Hidden until Peek is turned on for this world.
  await expect(page.getByRole("link", { name: /^Peek/ })).toHaveCount(0);
  await openRoute(page, "/worlds");
  await page.getByRole("group", { name: "Life in My world" }).getByText("Peek at their own texts").click();
  await openRoute(page, "/");
  await page.getByRole("link", { name: "Peek, 1 thread" }).click();
  await page.getByRole("list", { name: "Threads" }).getByRole("link", { name: /Aria & Kai/ }).click();
  await expect(page.getByRole("note")).toContainText("You're reading, not in this chat.");
  await expect(page.getByRole("list", { name: "Their texts" })).toContainText("harbour at 6, bring coffee");
  await expect(page.getByLabel("Message input")).toHaveCount(0);

  // Aria's next reply knows about it.
  await openChat(page);
  await sendMessage(page, "morning!");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("Recently you texted Kai:\nAria: you up?");
});
