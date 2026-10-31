import { test, expect, openChat, openRoute } from "./fixtures";
import type { Page } from "@playwright/test";

// The user's calls of 2026-10-31: the Characters page shows this world's
// people only; deleting a world deletes its people too, unless ticked to
// keep (as a variant inside the original's card when the original is in
// Default); and each world has an "Auto replies" switch, off in Default.

// Harbour Town with a copy of Aria (and her chat) and Bram, who's only there.
const harbourTown = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const tx = db.transaction(["worlds", "characters", "chats"], "readwrite");
    const add = (store: string, value: object) => new Promise<number>((r) => { const q = tx.objectStore(store).add(value); q.onsuccess = () => r(q.result as number); });
    const worldId = await add("worlds", { name: "Harbour Town", premise: "A rainy port." });
    const aria: any = await new Promise((r) => { const g = tx.objectStore("characters").get(1); g.onsuccess = () => r(g.result); });
    const { id: _id, ...rest } = aria;
    const copy = await add("characters", { ...rest, worldId, cardOf: 1 });
    const bram = await add("characters", { name: "Bram", prompt: "A fisherman.", description: "", worldId });
    await add("chats", { title: "Aria", timestamp: Date.now(), characterIds: [copy], worldId, content: [{ id: "h1", role: "ai", txt: "Rain again in the harbour.", timestamp: Date.now(), speakerId: copy }] });
    await add("chats", { title: "Bram", timestamp: Date.now(), characterIds: [bram], worldId, content: [{ id: "h2", role: "ai", txt: "Nets to mend.", timestamp: Date.now(), speakerId: bram }] });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
    return { worldId, copy, bram };
  });

const inDb = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const all = (store: string) => new Promise<any[]>((r) => { const g = db.transaction(store).objectStore(store).getAll(); g.onsuccess = () => r(g.result); });
    const [worlds, characters, chats] = [await all("worlds"), await all("characters"), await all("chats")];
    db.close();
    return { worlds, characters, chats };
  });

test("deleting a world deletes its people, and a kept copy becomes a variant in the original's card", async ({ page }) => {
  await openChat(page, 1);
  const { copy, bram } = await harbourTown(page);
  await openRoute(page, "/worlds");
  await page.reload();

  await page.getByLabel("Harbour Town", { exact: true }).getByRole("button", { name: "Delete world" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Harbour Town?" });
  await expect(dialog).toContainText("Kept as a variant in Aria's card");
  await expect(dialog).toContainText(`Kept as their own person in Default`);
  await dialog.getByRole("checkbox", { name: "Keep Aria" }).click();
  await dialog.getByRole("button", { name: "Delete, keep 1" }).click();
  await expect(dialog).toBeHidden();

  const after = await inDb(page);
  expect(after.worlds.map((w) => w.name)).not.toContain("Harbour Town");
  expect(after.characters.find((c) => c.id === bram)).toBeUndefined();
  expect(after.chats.find((c) => c.title === "Bram")).toBeUndefined();
  expect(after.characters.find((c) => c.id === copy)).toMatchObject({ variantFrom: "Harbour Town", cardOf: 1 });
  expect(after.chats.find((c) => c.characterIds?.[0] === copy)).toMatchObject({ title: "Aria (Harbour Town)" });

  // One Aria card in Default, with her variant inside it.
  await openRoute(page, "/characters");
  await expect(page.getByRole("article", { name: "Aria" })).toHaveCount(1);
  const variants = page.getByRole("group", { name: "Variants of Aria" });
  await variants.getByRole("button", { name: "Harbour Town" }).click();
  await page.getByRole("menuitem", { name: "Message Aria from Harbour Town" }).click();
  await expect(page.getByText("Rain again in the harbour.").first()).toBeVisible();
});

test("the Characters page shows only this world's people", async ({ page }) => {
  await openChat(page, 1);
  await harbourTown(page);
  await openRoute(page, "/characters");
  await page.reload();
  await expect(page.getByRole("article", { name: "Aria" })).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Bram" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^All worlds/ })).toHaveCount(0);
});

test.describe("auto replies", () => {
  test.use({ localStorageOverrides: { world_prefs: "{}" } });

  test("are off in Default and on in a world of yours, and the switch turns them on", async ({ page }) => {
    await openChat(page, 1);
    await harbourTown(page);
    await openRoute(page, "/worlds");
    await page.reload();
    const mine = page.getByRole("group", { name: "Life in Default" }).getByRole("switch", { name: "Auto replies" });
    await expect(mine).not.toBeChecked();
    await expect(page.getByRole("group", { name: "Life in Default" })).toContainText("nobody here does anything on their own");
    await expect(page.getByRole("group", { name: "Life in Harbour Town" }).getByRole("switch", { name: "Auto replies" })).toBeChecked();
    await mine.click();
    await expect(mine).toBeChecked();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("world_prefs") || "{}").mine)).toMatchObject({ autoReplies: true });
  });
});

// A double tap on Add used to bring in two copies (2026-10-31).
test("a double tap on Add brings in one copy", async ({ page }) => {
  await openChat(page, 1);
  const worldId = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const tx = db.transaction("worlds", "readwrite");
    const id: number = await new Promise((r) => { const q = tx.objectStore("worlds").add({ name: "Harbour Town", premise: "A rainy port." }); q.onsuccess = () => r(q.result as number); });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
    localStorage.setItem("current_world", String(id));
    return id;
  });
  await openRoute(page, "/characters");
  await page.reload();
  await page.getByRole("button", { name: "From another world" }).click();
  const dialog = page.getByRole("dialog", { name: "Add someone to Harbour Town" });
  await dialog.getByRole("button", { name: "Add Aria" }).dblclick();
  await expect(dialog).toContainText("Everyone from your other worlds is already here.");
  await page.waitForTimeout(500);
  const copies = (await inDb(page)).characters.filter((c) => c.worldId === worldId);
  expect(copies).toHaveLength(1);
});
