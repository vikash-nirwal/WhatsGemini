import type { BrowserContext, Page } from "@playwright/test";
import { test, expect, openRoute, openChat, sendMessage, waitForReplyDone, BASE_LOCAL_STORAGE, ARIA } from "./fixtures";

// Sync between computers (#274): two browser profiles stand for two
// computers. The folder picker gives each a folder in its own private
// storage, and the test copies files between the two the way Google Drive
// does between computers.

test.use({ seed: { messages: 4 } });

// The folder picker, faked: a folder named "drive" in the browser's private
// file storage, which Chrome lets a page write without asking.
const fakePicker = () => {
  (window as any).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("drive", { create: true });
};

type Files = Record<string, { data: number[]; modified: number }>;

// Every file under drive/.kindred-sync, by path.
const readDrive = (page: Page): Promise<Files> =>
  page.evaluate(async () => {
    const out: Record<string, { data: number[]; modified: number }> = {};
    const walk = async (dir: any, path: string) => {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === "directory") await walk(handle, `${path}${name}/`);
        else {
          const file = await handle.getFile();
          out[`${path}${name}`] = { data: Array.from(new Uint8Array(await file.arrayBuffer())), modified: file.lastModified };
        }
      }
    };
    const drive = await (await navigator.storage.getDirectory()).getDirectoryHandle("drive", { create: true });
    try {
      await walk(await drive.getDirectoryHandle(".kindred-sync"), "");
    } catch {
      // No sync folder yet.
    }
    return out;
  });

// Writes the files that differ, as Drive brings over what changed.
const writeDrive = (page: Page, files: Files) =>
  page.evaluate(async (files) => {
    const root = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("drive", { create: true })).getDirectoryHandle(".kindred-sync", { create: true });
    for (const [path, { data }] of Object.entries(files)) {
      const parts = path.split("/");
      let dir: any = root;
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
      const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const existing = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (existing.length === data.length && existing.every((b: number, i: number) => b === data[i])) continue;
      const w = await handle.createWritable();
      await w.write(new Uint8Array(data));
      await w.close();
    }
  }, files);

const driveSync = async (from: Page, to: Page) => writeDrive(to, await readDrive(from));

const secondComputer = async (context: BrowserContext): Promise<Page> => {
  const page = await context.newPage();
  await page.addInitScript((entries) => {
    try {
      if (sessionStorage.getItem("__e2e_init")) return;
      sessionStorage.setItem("__e2e_init", "1");
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    } catch {
      // about:blank
    }
  }, BASE_LOCAL_STORAGE);
  await page.addInitScript(fakePicker);
  return page;
};

const characterNames = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve) => { const r = indexedDB.open("ChatAppDB"); r.onsuccess = () => resolve(r.result); });
    const all: any[] = await new Promise((resolve) => { const r = db.transaction("characters").objectStore("characters").getAll(); r.onsuccess = () => resolve(r.result); });
    db.close();
    return all.map((c) => c.name).sort();
  });

test("two computers share chats and characters through an encrypted folder", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the same on every screen");
  test.setTimeout(120_000);
  await page.addInitScript(fakePicker);

  // The first computer turns sync on and gets the code.
  await openRoute(page, "/settings/data");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Turn on sync" }).click();
  const code = (await page.getByLabel("Sync code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(page.getByRole("status")).toContainText("In sync", { timeout: 20_000 });

  // Nothing in the folder can be read without the code.
  const files = await readDrive(page);
  expect(Object.keys(files).length).toBeGreaterThan(2);
  for (const [path, { data }] of Object.entries(files)) {
    expect(path).not.toMatch(/chat|character|aria/i);
    expect(Buffer.from(data).toString("latin1")).not.toMatch(/Aria|garage|Kindred/);
  }

  // The second computer has a character of its own, then joins.
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const mac = await secondComputer(context);
  await mac.goto("./");
  await expect(mac.getByRole("heading", { name: "Welcome to Kindred" })).toBeVisible({ timeout: 30_000 });
  await mac.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve) => { const r = indexedDB.open("ChatAppDB"); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("characters", "readwrite");
      tx.objectStore("characters").put({ id: 1, name: "Mira", prompt: "You are Mira.", description: "A painter" });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await driveSync(page, mac);
  await mac.goto("./#/settings/data");
  await mac.getByRole("button", { name: "Turn on sync" }).click();
  await mac.getByLabel("Sync code").fill("WRNG-WRNG-WRNG");
  await mac.getByRole("button", { name: "Join sync" }).click();
  await expect(mac.getByRole("alert")).toContainText("doesn't open this sync folder");
  await mac.getByLabel("Sync code").fill(code.toLowerCase());
  await mac.getByRole("button", { name: "Join sync" }).click();
  await expect(mac.getByRole("status")).toContainText("In sync", { timeout: 20_000 });
  // Both libraries, with Mira on a new id that can't clash with the PC's.
  await expect.poll(() => characterNames(mac)).toEqual([ARIA.name, "Mira"].sort());
  const miraId = await mac.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve) => { const r = indexedDB.open("ChatAppDB"); r.onsuccess = () => resolve(r.result); });
    const all: any[] = await new Promise((resolve) => { const r = db.transaction("characters").objectStore("characters").getAll(); r.onsuccess = () => resolve(r.result); });
    db.close();
    return all.find((c) => c.name === "Mira").id;
  });
  expect(miraId).toBeGreaterThan(1e12);

  // Mira goes to the first computer.
  await expect.poll(async () => Object.keys(await readDrive(mac)).length, { timeout: 15_000 }).toBeGreaterThan(Object.keys(files).length);
  await driveSync(mac, page);
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect.poll(() => characterNames(page)).toEqual([ARIA.name, "Mira"].sort());

  // A message sent on the first computer reaches the second.
  await openChat(page);
  await sendMessage(page, "See you on the other computer");
  await waitForReplyDone(page);
  await expect.poll(async () => {
    await driveSync(page, mac);
    await mac.getByRole("button", { name: "Sync now" }).click();
    return mac.evaluate(async () => {
      const db: IDBDatabase = await new Promise((resolve) => { const r = indexedDB.open("ChatAppDB"); r.onsuccess = () => resolve(r.result); });
      const chat: any = await new Promise((resolve) => { const r = db.transaction("chats").objectStore("chats").get(1); r.onsuccess = () => resolve(r.result); });
      db.close();
      return (chat?.content || []).some((m: any) => m.txt === "See you on the other computer");
    });
  }, { timeout: 30_000, intervals: [2000] }).toBe(true);

  // In step: another round writes nothing, so the two don't ping-pong.
  await openRoute(page, "/settings/data");
  await driveSync(mac, page);
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("status")).toContainText("In sync");
  const settled = await readDrive(page);
  for (const p of [page, mac]) {
    await p.getByRole("button", { name: "Sync now" }).click();
    await expect(p.getByRole("status")).toContainText("In sync");
  }
  const after = await readDrive(page);
  expect(Object.fromEntries(Object.entries(after).map(([k, v]) => [k, v.modified]))).toEqual(Object.fromEntries(Object.entries(settled).map(([k, v]) => [k, v.modified])));
  await context.close();
});
