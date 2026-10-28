import { test, expect, openRoute, openChat, sendMessage, waitForReplyDone, ARIA, KAI } from "./fixtures";

// God mode for a whole world (2026-10-28): an announcement on the Worlds
// page becomes true there, everyone hears it, each takes it their own way,
// and their replies carry both the news and their own take.

test.use({ seed: { messages: 2, room: false } });

const db = <T,>(page: import("@playwright/test").Page, fn: string, arg?: unknown) =>
  page.evaluate(async ({ fn, arg }) => {
    const open: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const out = await new AsyncFunction("db", "arg", fn)(open, arg);
    open.close();
    return out;
  }, { fn, arg }) as Promise<T>;

test("an announcement reaches everyone, each in their own way", async ({ page, mockAI }) => {
  mockAI.reply((req) =>
    req.prompt.includes("It has just been announced to everyone")
      ? "Aria :: You're thrilled and plan a harbour party. :: -\nKai :: You're worried for the boats and start fixing them up. :: Busy week at the yard 🔧"
      : "Mock reply"
  );
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await openRoute(page, "/worlds");

  // Aria and Kai live there; Kai posts statuses.
  await db(page, `
    const worlds = await new Promise((r) => { const q = db.transaction("worlds").objectStore("worlds").getAll(); q.onsuccess = () => r(q.result); });
    const worldId = worlds.find((w) => w.name === "Harbour Town").id;
    const tx = db.transaction("characters", "readwrite");
    const store = tx.objectStore("characters");
    const aria = await new Promise((r) => { const q = store.get(${ARIA.id}); q.onsuccess = () => r(q.result); });
    store.put({ ...aria, worldId });
    store.put({ ...aria, id: ${KAI.id}, name: "Kai", prompt: "A boat mechanic.", worldId, postsStatuses: true, statuses: [] });
    await new Promise((r) => { tx.oncomplete = r; });
    // Aria's chat is in that world, as one started there would be.
    const tc = db.transaction("chats", "readwrite");
    const chats = tc.objectStore("chats");
    const chat = await new Promise((r) => { const q = chats.get(1); q.onsuccess = () => r(q.result); });
    chats.put({ ...chat, worldId });
    await new Promise((r) => { tc.oncomplete = r; });
  `);
  await page.reload();

  const section = page.getByRole("region", { name: "Announcements" });
  await section.getByRole("textbox", { name: "Announcement" }).fill("The harbour will host the royal regatta.");
  await section.getByRole("button", { name: "Announce" }).click();
  await expect(section.getByRole("button", { name: "How they took it · 2" })).toBeVisible();
  const ask = mockAI.requests.find((r) => r.prompt.includes("It has just been announced to everyone"))!.prompt;
  expect(ask).toContain("- Aria:");
  expect(ask).toMatch(/^- Kai: .*A boat mechanic\./m);
  await section.getByRole("button", { name: "How they took it · 2" }).click();
  await expect(section).toContainText("Aria: They're thrilled and plan a harbour party.");
  await expect(section).toContainText("Kai: They're worried for the boats and start fixing them up.");

  // Kai posted about it; both remember it.
  const kai = await db<{ statuses: { text: string }[]; memory: string[] }>(page, `return await new Promise((r) => { const q = db.transaction("characters").objectStore("characters").get(${KAI.id}); q.onsuccess = () => r(q.result); });`);
  expect(kai.statuses.map((s) => s.text)).toContain("Busy week at the yard 🔧");
  expect(kai.memory.join("\n")).toContain("It was announced to everyone in Harbour Town: The harbour will host the royal regatta.");

  // In the timeline, as news for everyone.
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("list", { name: "World timeline" })).toContainText("Announced to everyone: The harbour will host the royal regatta.");

  // Aria's reply carries the news and her own take.
  await openChat(page);
  await sendMessage(page, "heard the news?");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("Announced to everyone in Harbour Town by the author");
  expect(system).toContain("The harbour will host the royal regatta.");
  expect(system).toContain("How you took it: You're thrilled and plan a harbour party.");
  expect(system).not.toContain("start fixing them up");

  // Taken back, it's gone from the list.
  await openRoute(page, "/worlds");
  await section.getByRole("button", { name: "Take back: The harbour will host the royal regatta." }).click();
  await expect(section.getByText("The harbour will host the royal regatta.")).toHaveCount(0);
});
