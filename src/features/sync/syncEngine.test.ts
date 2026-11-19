import { webcrypto } from "crypto";
import { TextDecoder, TextEncoder } from "util";

// jsdom has no Web Crypto subtle API; Node's own is the same API.
Object.assign(globalThis, { TextEncoder, TextDecoder });
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

/* eslint-disable import/first */
import { blobBytes, checkHeader, createSyncEngine, readHeaderSalt, SyncLocal, SyncMeta, SyncState, writeHeader } from "./syncEngine";
import { deriveSyncKey, makeSyncCode, normalizeSyncCode, WrongSyncCodeError } from "./syncCrypto";
import { memoryFolder } from "./syncFolder";
/* eslint-enable import/first */

// Two computers sharing one folder (#274): each has its own library and
// its own memory of what it synced, as the app keeps in its database.

const PICTURE = `data:image/png;base64,${"iVBORw0KGgo".repeat(800)}`;

const computer = (name: string) => {
  const records = new Map<string, unknown>();
  const media = new Map<string, Blob>();
  const files = new Map<string, Blob>();
  const metas = new Map<string, SyncMeta>();
  const seen: Record<string, Record<string, number>> = {};
  const copies: unknown[] = [];
  let clock = 1000;
  const local: SyncLocal = {
    keys: async () => Array.from(records.keys()),
    get: async (k) => records.get(k),
    put: async (k, v) => void records.set(k, v),
    remove: async (k) => void records.delete(k),
    keepCopy: async (_k, v) => void copies.push(v),
    watched: [],
    mediaIds: async () => Array.from(media.keys()),
    getMedia: async (id) => media.get(id),
    putMedia: async (id, blob) => void media.set(id, blob),
    hasFile: async (n) => files.has(n),
    readFile: async (n) => files.get(n),
    writeFile: async (n, b) => (files.set(n, b), true),
  };
  const state: SyncState = {
    metas: async () => Array.from(metas.values()),
    putMetas: async (list) => list.forEach((m) => metas.set(m.key, m)),
    markPushed: async (list) => list.forEach((m) => { if (metas.get(m.key)?.at === m.at) metas.set(m.key, m); }),
    seen: async (dir) => ({ ...(seen[dir] || {}) }),
    setSeen: async (dir, map) => void (seen[dir] = map),
  };
  // A change made here, as the database hooks note it.
  const change = (k: string, v: unknown) => {
    records.set(k, v);
    metas.set(k, { key: k, at: (clock += 10), dirty: 1 });
  };
  const remove = (k: string) => {
    records.delete(k);
    metas.set(k, { key: k, at: (clock += 10), dirty: 1, del: 1 });
  };
  return { name, records, media, files, metas, copies, local, state, change, remove, tick: (t: number) => (clock = t) };
};

const setup = async () => {
  const folder = memoryFolder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveSyncKey("ABCD-EFGH-JKMN", salt);
  const engineFor = (c: ReturnType<typeof computer>) => createSyncEngine({ folder, local: c.local, state: c.state, key, salt, device: c.name });
  return { folder, key, salt, engineFor };
};

describe("two computers syncing through a folder", () => {
  it("brings a new chat across, and its edit back", async () => {
    const { engineFor } = await setup();
    const pc = computer("pc");
    const mac = computer("mac");
    pc.change("chats:1", { id: 1, title: "Beach", content: [{ txt: "hi" }] });
    await engineFor(pc).push();
    expect(await engineFor(mac).pull()).toEqual(new Set(["chats:1"]));
    expect(mac.records.get("chats:1")).toEqual({ id: 1, title: "Beach", content: [{ txt: "hi" }] });

    mac.tick(5000);
    mac.change("chats:1", { id: 1, title: "Beach", content: [{ txt: "hi" }, { txt: "hello" }] });
    await engineFor(mac).push();
    await engineFor(pc).pull();
    expect((pc.records.get("chats:1") as any).content).toHaveLength(2);
    // Nothing more to do on either side: no echo.
    expect(await engineFor(pc).push()).toBe(0);
    expect((await engineFor(mac).pull()).size).toBe(0);
  });

  it("carries a deletion", async () => {
    const { engineFor } = await setup();
    const pc = computer("pc");
    const mac = computer("mac");
    pc.change("characters:5", { id: 5, name: "Aria" });
    await engineFor(pc).push();
    await engineFor(mac).pull();
    mac.tick(5000);
    mac.remove("characters:5");
    await engineFor(mac).push();
    await engineFor(pc).pull();
    expect(pc.records.has("characters:5")).toBe(false);
  });

  it("keeps the newer version, and a chat changed on both keeps the other as a copy", async () => {
    const { engineFor } = await setup();
    const pc = computer("pc");
    const mac = computer("mac");
    pc.change("chats:1", { id: 1, title: "A" });
    await engineFor(pc).push();
    await engineFor(mac).pull();
    pc.tick(2000);
    pc.change("chats:1", { id: 1, title: "from pc" });
    mac.tick(3000);
    mac.change("chats:1", { id: 1, title: "from mac" });
    await engineFor(mac).push();
    await engineFor(pc).pull();
    expect(pc.records.get("chats:1")).toEqual({ id: 1, title: "from mac" });
    expect(pc.copies).toEqual([{ id: 1, title: "from pc" }]);
  });

  it("keeps this computer's newer change over an older one in the folder", async () => {
    const { engineFor } = await setup();
    const pc = computer("pc");
    const mac = computer("mac");
    mac.change("characters:2", { name: "old" });
    await engineFor(mac).push();
    pc.tick(9000);
    pc.change("characters:2", { name: "new" });
    await engineFor(pc).pull();
    expect(pc.records.get("characters:2")).toEqual({ name: "new" });
    await engineFor(pc).push();
    await engineFor(mac).pull();
    expect(mac.records.get("characters:2")).toEqual({ name: "new" });
  });

  it("sends pictures once, in their own files, and puts them back", async () => {
    const { engineFor, folder } = await setup();
    const pc = computer("pc");
    const mac = computer("mac");
    pc.change("characters:1", { name: "Aria", avatar: PICTURE, appearanceImages: [PICTURE, "local:aria.png"] });
    pc.files.set("aria.png", new Blob(["png bytes"], { type: "image/png" }));
    pc.media.set("abc", new Blob(["stored"], { type: "image/jpeg" }));
    await engineFor(pc).push();
    // The record's own file is small: the picture went to p/ once.
    const record = Array.from(folder.files.entries()).find(([p]) => p.startsWith("r/"))![1];
    expect(record.data.length).toBeLessThan(1000);
    expect(Array.from(folder.files.keys()).filter((p) => p.startsWith("p/"))).toHaveLength(1);

    await engineFor(mac).pull();
    expect(mac.records.get("characters:1")).toEqual({ name: "Aria", avatar: PICTURE, appearanceImages: [PICTURE, "local:aria.png"] });
    const text = async (b: Blob) => new TextDecoder().decode(await blobBytes(b));
    expect(await text(mac.files.get("aria.png")!)).toBe("png bytes");
    expect(await text(mac.media.get("abc")!)).toBe("stored");

    // A change to the character doesn't send the picture again.
    const before = folder.files.size;
    pc.tick(5000);
    pc.change("characters:1", { name: "Aria", avatar: PICTURE, appearanceImages: [PICTURE, "local:aria.png"], points: 3 });
    await engineFor(pc).push();
    expect(folder.files.size).toBe(before);
  });

  it("waits for a picture Drive hasn't brought over yet", async () => {
    const { engineFor, folder } = await setup();
    const pc = computer("pc");
    const mac = computer("mac");
    pc.change("characters:1", { avatar: PICTURE });
    await engineFor(pc).push();
    const pic = Array.from(folder.files.keys()).find((p) => p.startsWith("p/"))!;
    const saved = folder.files.get(pic)!;
    folder.files.delete(pic);
    expect((await engineFor(mac).pull()).size).toBe(0);
    folder.files.set(pic, saved);
    expect(await engineFor(mac).pull()).toEqual(new Set(["characters:1"]));
  });

  it("weighs a copy Drive made against the record, then removes it", async () => {
    const { engineFor, folder } = await setup();
    const pc = computer("pc");
    const mac = computer("mac");
    pc.change("worlds:1", { name: "Old" });
    await engineFor(pc).push();
    const [path, file] = Array.from(folder.files.entries()).find(([p]) => p.startsWith("r/"))!;
    // The mac's newer version arrived as Drive's "(1)" copy.
    mac.tick(9000);
    mac.change("worlds:1", { name: "Newer" });
    await engineFor(mac).push();
    const [, newer] = Array.from(folder.files.entries()).find(([p]) => p === path)!;
    folder.files.set(path, file);
    folder.files.set(path.replace(".kbin", " (1).kbin"), newer);

    const third = computer("laptop");
    await engineFor(third).pull();
    expect(third.records.get("worlds:1")).toEqual({ name: "Newer" });
    expect(Array.from(folder.files.keys()).some((p) => p.includes("(1)"))).toBe(false);
    // And the record's own file is put right.
    await engineFor(third).push();
    const fresh = computer("fresh");
    await engineFor(fresh).pull();
    expect(fresh.records.get("worlds:1")).toEqual({ name: "Newer" });
  });

  it("doesn't lose a change made while it was being written", async () => {
    const { engineFor } = await setup();
    const pc = computer("pc");
    pc.change("chats:1", { title: "a" });
    const engine = engineFor(pc);
    const original = pc.local.get;
    pc.local.get = async (k) => {
      const v = await original(k);
      pc.change("chats:1", { title: "b" }); // typed while writing
      return v;
    };
    await engine.push();
    expect(pc.metas.get("chats:1")!.dirty).toBe(1);
  });

  it("sends a watched record when it changes", async () => {
    const { engineFor } = await setup();
    const pc = computer("pc");
    const mac = computer("mac");
    pc.local.watched = ["prefs"];
    mac.local.watched = ["prefs"];
    pc.records.set("prefs", { personas: [{ name: "Vik" }] });
    expect(await engineFor(pc).push()).toBe(1);
    expect(await engineFor(pc).push()).toBe(0);
    await engineFor(mac).pull();
    expect(mac.records.get("prefs")).toEqual({ personas: [{ name: "Vik" }] });
    // Taken from the folder, it isn't sent back.
    expect(await engineFor(mac).push()).toBe(0);
  });

  it("gives a joining computer the folder's watched records over its own", async () => {
    const { engineFor } = await setup();
    const pc = computer("pc");
    const mac = computer("mac");
    pc.local.watched = ["prefs"];
    mac.local.watched = ["prefs"];
    pc.records.set("prefs", { personas: [{ name: "Vik" }] });
    await engineFor(pc).push();
    mac.records.set("prefs", { personas: [{ name: "Default" }] });
    await engineFor(mac).yieldWatched();
    await engineFor(mac).pull();
    expect(mac.records.get("prefs")).toEqual({ personas: [{ name: "Vik" }] });
  });
});

describe("the folder is unreadable without the code", () => {
  it("keeps no plain text in any file", async () => {
    const { engineFor, folder } = await setup();
    const pc = computer("pc");
    pc.change("chats:1", { title: "Secret beach date", content: [{ txt: "meet me at midnight" }] });
    await engineFor(pc).push();
    for (const { data } of Array.from(folder.files.values())) {
      const text = Buffer.from(data).toString("latin1");
      expect(text).not.toMatch(/beach|midnight|chats/);
    }
  });

  it("tells a wrong code from the right one", async () => {
    const folder = memoryFolder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const code = makeSyncCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await writeHeader(folder, await deriveSyncKey(code, salt), salt);
    const readSalt = (await readHeaderSalt(folder))!;
    await expect(checkHeader(folder, await deriveSyncKey(code.toLowerCase().replace(/-/g, " "), readSalt))).resolves.toBeUndefined();
    await expect(checkHeader(folder, await deriveSyncKey("WRNG-CODE-HERE", readSalt))).rejects.toBeInstanceOf(WrongSyncCodeError);
    expect(normalizeSyncCode(" ab-cd ")).toBe("ABCD");
  });
});
