import { test, expect, openRoute, openChat, sendMessage, waitForReplyDone, ARIA, KAI } from "./fixtures";

// A world's language and reply length (the user's ask, 2026-10-30), set when
// it's made and changed in its editor, where its cast card also edits how
// the people living there are connected.

test.use({ seed: { messages: 2, room: false } });

const db = <T,>(page: import("@playwright/test").Page, fn: string) =>
  page.evaluate(async (fn) => {
    const open: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const out = await new AsyncFunction("db", fn)(open);
    open.close();
    return out;
  }, fn) as Promise<T>;

const characterOf = (page: import("@playwright/test").Page, id: number) =>
  db<{ ties?: { withId: number; tie: string }[]; relationship?: string }>(page, `return await new Promise((r) => { const q = db.transaction("characters").objectStore("characters").get(${id}); q.onsuccess = () => r(q.result); });`);

test("a world's language, reply length and connections are set in the editor and used in chats", async ({ page, mockAI }) => {
  mockAI.reply("Mock reply");
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port.");
  await page.getByLabel("Language").fill("Hindi");
  await page.getByLabel("Reply length").fill("300");
  await page.getByRole("button", { name: "Create World" }).click();
  await expect(page.getByRole("button", { name: "Switch to Harbour Town" })).toBeVisible();

  // Aria and Kai live there, not yet connected; Aria's chat is set there.
  const worldId = await db<number>(page, `
    const worlds = await new Promise((r) => { const q = db.transaction("worlds").objectStore("worlds").getAll(); q.onsuccess = () => r(q.result); });
    const worldId = worlds.find((w) => w.name === "Harbour Town").id;
    const tx = db.transaction(["characters", "chats"], "readwrite");
    const store = tx.objectStore("characters");
    const aria = await new Promise((r) => { const q = store.get(${ARIA.id}); q.onsuccess = () => r(q.result); });
    store.put({ ...aria, worldId, ties: undefined, knowsAbout: undefined });
    store.put({ ...aria, id: ${KAI.id}, name: "Kai", prompt: "A boat mechanic.", worldId, ties: undefined, knowsAbout: undefined });
    const chats = tx.objectStore("chats");
    const chat = await new Promise((r) => { const q = chats.get(1); q.onsuccess = () => r(q.result); });
    chats.put({ ...chat, worldId });
    await new Promise((r) => { tx.oncomplete = r; });
    return worldId;
  `);
  await page.reload();

  await openRoute(page, `/worlds/${worldId}/edit`);
  await expect(page.getByLabel("Language")).toHaveValue("Hindi");
  await expect(page.getByLabel("Reply length")).toHaveValue("300");
  // Connections are edited in the cast card, saved straight away.
  const cast = page.getByLabel("Cast and relationships");
  await cast.getByRole("button", { name: "Add a connection" }).click();
  const form = cast.getByRole("group", { name: "Connection" });
  await form.getByLabel("What Kai is to Aria").fill("brother");
  await form.getByLabel("What Aria is to Kai").fill("sister");
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await characterOf(page, ARIA.id)).ties).toEqual([{ withId: KAI.id, tie: "your brother" }]);
  expect((await characterOf(page, KAI.id)).ties).toEqual([{ withId: ARIA.id, tie: "your sister" }]);
  await cast.getByLabel("Kai to you").fill("Neighbour");
  await cast.getByLabel("Kai to you").blur();
  await expect.poll(async () => (await characterOf(page, KAI.id)).relationship).toBe("Neighbour");
  await cast.getByRole("button", { name: "Remove Aria and Kai" }).click();
  await expect.poll(async () => (await characterOf(page, ARIA.id)).ties || []).toEqual([]);
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page).toHaveURL(/\/worlds$/);

  // A chat there gets the world's language and reply length.
  await openChat(page);
  await sendMessage(page, "hello");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("Everyone in Harbour Town speaks Hindi");
  expect(system).toContain("roughly 300 characters");
});
