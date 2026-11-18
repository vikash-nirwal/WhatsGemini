import { readFileSync } from "fs";
import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, sendMessage, waitForReplyDone, messageBubble } from "./fixtures";

// Pictures kept apart from chats (the out-of-memory crash of 2026-11-18): a
// picture inside a chat is moved to its own table when the app opens, a new
// one is stored there as it's saved, both still show, and a backup carries
// them to a browser that doesn't have them.

test.use({ seed: { messages: 4 } });

// A noisy picture, big enough to be moved (a tiny one stays inline).
const makePicture = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(160, 160);
    // Random, so it doesn't compress below the size that's moved.
    for (let i = 0; i < img.data.length; i++) img.data[i] = i % 4 === 3 ? 255 : (Math.random() * 256) | 0;
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL("image/png");
  });

// What chat 1 keeps in its messages and branches, and what's in the table.
const storedState = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const chat: any = await new Promise((resolve) => { const r = db.transaction("chats").objectStore("chats").get(1); r.onsuccess = () => resolve(r.result); });
    const media: number = await new Promise((resolve) => { const r = db.transaction("media").objectStore("media").count(); r.onsuccess = () => resolve(r.result); });
    db.close();
    const all = [...(chat.content || []), ...Object.values(chat.tree?.nodes || {}).map((n: any) => n.message)].flatMap((m: any) => m?.images || []);
    return { inline: all.filter((s: string) => s.startsWith("data:")).length, refs: all.filter((s: string) => s.startsWith("media:")).length, media };
  });

// Every picture in the chat on screen has loaded.
const picturesShown = (page: Page) =>
  page.locator('[aria-label="Messages"] img').evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length);

test("a picture inside an old chat is moved out when the app opens, and still shows", async ({ page }) => {
  await openChat(page);
  const picture = await makePicture(page);
  // As chats were saved before: the picture inside the message.
  await page.evaluate(async (src) => {
    const db: IDBDatabase = await new Promise((resolve) => { const req = indexedDB.open("ChatAppDB"); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction("chats", "readwrite");
    const store = tx.objectStore("chats");
    const chat: any = await new Promise((resolve) => { const r = store.get(1); r.onsuccess = () => resolve(r.result); });
    chat.content[0] = { ...chat.content[0], images: [src] };
    store.put(chat);
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
  }, picture);
  expect(await storedState(page)).toEqual({ inline: 1, refs: 0, media: 0 });

  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => storedState(page)).toEqual({ inline: 0, refs: 1, media: 1 });
  await expect.poll(() => picturesShown(page)).toBe(1);
});

test("a photo you send is stored apart, reaches the AI, and comes back from a backup", async ({ page, mockAI }) => {
  await openChat(page);
  const picture = await makePicture(page);
  mockAI.reply("What a picture!");
  await page.getByTestId("photo-input").setInputFiles({ name: "noise.png", mimeType: "image/png", buffer: Buffer.from(picture.split(",")[1], "base64") });
  await sendMessage(page, "Look at this");
  await expect(messageBubble(page, "What a picture!")).toBeVisible();
  await waitForReplyDone(page);

  // Stored apart, and sent to the model as a picture.
  await expect.poll(async () => (await storedState(page)).refs).toBeGreaterThan(0);
  expect((await storedState(page)).inline).toBe(0);
  const sent = mockAI.requests.find((r) => JSON.stringify(r.messages).includes("image_url"));
  expect(sent).toBeTruthy();
  await expect.poll(() => picturesShown(page)).toBe(1);

  // A backup carries it to a browser that doesn't have it.
  await openRoute(page, "/settings/data");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full backup" }).click();
  const file = await (await download).path();
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve) => { const req = indexedDB.open("ChatAppDB"); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction("media", "readwrite");
    tx.objectStore("media").clear();
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
  });
  expect((await storedState(page)).media).toBe(0);
  await page.locator('input[type="file"][accept=".zip,.json"]').setInputFiles({ name: "kindred_backup.zip", mimeType: "application/zip", buffer: readFileSync(file!) });
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
  await expect.poll(async () => (await storedState(page)).media).toBeGreaterThan(0);
  await openChat(page);
  await expect.poll(() => picturesShown(page)).toBe(1);
});
