import { readFileSync } from "fs";
import { test, expect, openRoute } from "./fixtures";

// A full backup round trip (#235): exported, then restored into the same
// library, where every id is taken. The copies get new ids and still point
// at each other, and adventures, channels and your statuses come back too.

test.use({ seed: { messages: 2, room: true, adventure: true } });

const readDb = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const getAll = (name: string): Promise<any[]> => new Promise((resolve) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); });
    const setting = (key: string): Promise<any> => new Promise((resolve) => { const r = db.transaction("settings").objectStore("settings").get(key); r.onsuccess = () => resolve(r.result?.value); });
    const out = { characters: await getAll("characters"), adventures: await getAll("adventures"), channels: await setting("channels"), myStatuses: await setting("my_statuses") };
    db.close();
    return out;
  });

test("a full backup restores into a taken library with everyone relinked", async ({ page }) => {
  await openRoute(page, "/settings/data");
  // Aria and Kai are siblings who talked, Aria follows Kai's channel, and
  // you posted a status Aria saw.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(["characters", "settings"], "readwrite");
    const chars = tx.objectStore("characters");
    const all: any[] = await new Promise((resolve) => { const r = chars.getAll(); r.onsuccess = () => resolve(r.result); });
    const aria = all.find((c) => c.name === "Aria"), kai = all.find((c) => c.name === "Kai");
    const [low, high] = aria.id < kai.id ? [aria, kai] : [kai, aria];
    chars.put({ ...aria, ties: [{ withId: kai.id, tie: "your brother" }], knowsAbout: [kai.id] });
    chars.put({ ...kai, ties: [{ withId: aria.id, tie: "your sister" }] });
    if (low.id === aria.id) chars.put({ ...aria, ties: [{ withId: kai.id, tie: "your brother" }], knowsAbout: [kai.id], talks: [{ id: "t", withId: high.id, at: 1, lines: [{ speakerId: kai.id, text: "hey sis" }] }] });
    const settings = tx.objectStore("settings");
    settings.put({ key: "channels", value: [{ id: `character-${kai.id}`, kind: "character", refId: kai.id, followedAt: 1, posts: [] }] });
    settings.put({ key: "my_statuses", value: [{ id: "my-1", text: "Sunset", createdAt: 1, views: [{ characterId: aria.id, at: 2 }] }] });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
  });
  await page.reload();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full backup" }).click();
  const file = await (await download).path();
  await expect(page.getByText(/Backed up 2 chat\(s\), 2 character\(s\), 0 world\(s\) and 1 adventure\(s\)/)).toBeVisible();

  // The same backup again, on top of itself: every id is taken.
  await page.locator('input[type="file"][accept=".zip,.json"]').setInputFiles({ name: "kindred_backup.zip", mimeType: "application/zip", buffer: readFileSync(file!) });
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Restored 2 chat\(s\), 2 character\(s\), 0 world\(s\) and 1 adventure\(s\)/)).toBeVisible();

  const { characters, adventures, channels, myStatuses } = await readDb(page);
  const arias = characters.filter((c) => c.name === "Aria").sort((a, b) => a.id - b.id);
  const kais = characters.filter((c) => c.name === "Kai").sort((a, b) => a.id - b.id);
  expect(arias).toHaveLength(2);
  const [aria2, kai2] = [arias[1], kais[1]];
  // The copies point at each other, not at the originals.
  expect(aria2.ties).toEqual([{ withId: kai2.id, tie: "your brother" }]);
  expect(kai2.ties).toEqual([{ withId: aria2.id, tie: "your sister" }]);
  expect(aria2.knowsAbout).toEqual([kai2.id]);
  const holder = aria2.id < kai2.id ? aria2 : kai2;
  expect(holder.talks?.[0]).toMatchObject({ withId: holder.id === aria2.id ? kai2.id : aria2.id, lines: [{ speakerId: kai2.id, text: "hey sis" }] });
  expect(adventures).toHaveLength(2);
  expect(channels.map((c: { id: string }) => c.id)).toEqual([`character-${kais[0].id}`, `character-${kai2.id}`]);
  // Your status was already here, so it's kept once.
  expect(myStatuses).toHaveLength(1);
});
