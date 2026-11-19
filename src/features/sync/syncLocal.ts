import { db, dbService, setNewIdMaker, setWriteListener } from "../../services/dbService";
import { allWorldPrefs, replaceAllWorldPrefs, WorldPrefs } from "../world/worldPrefs";
import { UserProfile } from "../../types";
import { SyncLocal, SyncMeta, SyncState } from "./syncEngine";

// This computer's side of sync (#274): the database's records as the
// engine sees them, and noting every change as it's saved. The notes are
// made where the database writes (dbService.ts), so every way a chat or character is saved is
// covered, not just the ones that remember to say so.

const TABLES = ["chats", "characters", "worlds", "adventures"] as const;
type TableName = (typeof TABLES)[number];

// What's kept in the settings table that's part of the library: channels,
// your statuses and each world's timeline. The rest there (the save folder,
// caches, the helper's reply log) belongs to this computer.
export const syncedSetting = (key: string) => key === "channels" || key === "my_statuses" || key.startsWith("world_timeline_");

export const PREFS = "prefs";

// ---- On or off ----

export const LS_SYNC_ON = "kindred_sync_on";
let on = (() => {
  try {
    return localStorage.getItem(LS_SYNC_ON) === "true";
  } catch {
    return false;
  }
})();
export const syncIsOn = () => on;
export const setSyncOn = (value: boolean) => {
  on = value;
  try {
    localStorage.setItem(LS_SYNC_ON, String(value));
  } catch {
    // Private mode: on for this visit only.
  }
};

// ---- Ids that two computers never both hand out ----

// The database numbers new records one past the highest, so two computers
// would both make "chat 41". With sync on, a new record's id is the time in
// microseconds plus a random part instead: still a number, still in order
// of creation, and never the same on two computers.
let lastId = 0;
export const nextSyncId = (): number => {
  lastId = Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), lastId + 1);
  return lastId;
};

// ---- Noting changes ----

// Records being taken from the folder: saving them isn't a change here.
const applying = new Set<string>();
// Paused while a computer joining sync clears its library.
let tracking = true;
const pending = new Map<string, SyncMeta>();
let flushing: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
export const onLocalChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

const flush = async () => {
  flushing = undefined;
  const metas = Array.from(pending.values());
  pending.clear();
  if (metas.length) await db.sync.bulkPut(metas as any);
  listeners.forEach((fn) => fn());
};

export const noteChange = (key: string, deleted = false) => {
  if (!on || !tracking || applying.has(key)) return;
  pending.set(key, { key, at: Date.now(), dirty: 1, ...(deleted ? { del: 1 } : {}) });
  // After the save's own transaction, in a fresh one.
  if (!flushing) flushing = setTimeout(() => void flush(), 0);
};

export const pauseTracking = async <T,>(work: () => Promise<T>): Promise<T> => {
  tracking = false;
  try {
    return await work();
  } finally {
    tracking = true;
  }
};

// Every write to the library, from the database layer (dbService.ts).
let hooked = false;
export const installSyncHooks = () => {
  if (hooked) return;
  hooked = true;
  setNewIdMaker(() => (on ? nextSyncId() : undefined));
  setWriteListener((table, keys, deleted) => {
    if (!on) return;
    if ((TABLES as readonly string[]).includes(table)) keys.forEach((k) => noteChange(`${table}:${k}`, deleted));
    else if (table === "settings") keys.filter((k) => syncedSetting(String(k))).forEach((k) => noteChange(`settings:${k}`, deleted));
    // A new stored picture goes over with the next write.
    else if (table === "media" && tracking) listeners.forEach((fn) => fn());
  });
};

// ---- The library as records ----

const parse = (key: string): { table: TableName; id: number } | { setting: string } | undefined => {
  const at = key.indexOf(":");
  const kind = key.slice(0, at);
  const rest = key.slice(at + 1);
  if (kind === "settings") return { setting: rest };
  if ((TABLES as readonly string[]).includes(kind) && rest !== "" && !Number.isNaN(Number(rest))) return { table: kind as TableName, id: Number(rest) };
  return undefined;
};

export interface Prefs {
  personas: UserProfile[];
  activePersonaId: string;
  worldPrefs: Record<string, WorldPrefs>;
}

export interface PrefsBinding {
  read(): { personas: UserProfile[]; activePersonaId: string };
  apply(prefs: Prefs): void;
}

const fileAccess = async (): Promise<FileSystemDirectoryHandle | undefined> => {
  const handle = (await dbService.getSetting("image_save_directory")) as FileSystemDirectoryHandle | undefined;
  if (!handle) return undefined;
  try {
    return (await (handle as any).queryPermission?.({ mode: "readwrite" })) === "granted" ? handle : undefined;
  } catch {
    return undefined;
  }
};

export const dexieLocal = (prefs: PrefsBinding): SyncLocal => ({
  async keys() {
    const keys: string[] = [];
    for (const name of TABLES) keys.push(...(await db.table(name).toCollection().primaryKeys()).map((id) => `${name}:${id}`));
    keys.push(...((await db.settings.toCollection().primaryKeys()) as string[]).filter(syncedSetting).map((k) => `settings:${k}`));
    keys.push(PREFS);
    return keys;
  },
  async get(key) {
    if (key === PREFS) return { ...prefs.read(), worldPrefs: allWorldPrefs() } as Prefs;
    const where = parse(key);
    if (!where) return undefined;
    if ("setting" in where) return (await db.settings.get(where.setting))?.value;
    return db.table(where.table).get(where.id);
  },
  async put(key, value) {
    if (key === PREFS) {
      const next = value as Prefs;
      replaceAllWorldPrefs(next.worldPrefs || {});
      prefs.apply(next);
      return;
    }
    const where = parse(key);
    if (!where) return;
    applying.add(key);
    try {
      if ("setting" in where) await db.settings.put({ key: where.setting, value });
      else await db.table(where.table).put({ ...(value as object), id: where.id });
    } finally {
      applying.delete(key);
    }
  },
  async remove(key) {
    const where = parse(key);
    if (!where) return;
    applying.add(key);
    try {
      if ("setting" in where) await db.settings.delete(where.setting);
      else await db.table(where.table).delete(where.id);
    } finally {
      applying.delete(key);
    }
  },
  async keepCopy(key, value) {
    const where = parse(key);
    if (!where || !("table" in where) || where.table !== "chats") return;
    // A new chat, so it goes to the other computer too.
    const { id: _id, ...rest } = value as { id?: number; title?: string };
    await db.chats.add({ ...(rest as any), title: `${rest.title || "Chat"} (other version)` });
  },
  watched: [PREFS],
  mediaIds: async () => (await db.media.toCollection().primaryKeys()) as string[],
  getMedia: async (id) => (await db.media.get(id))?.blob,
  async putMedia(id, blob) {
    await db.media.put({ id, blob, createdAt: Date.now() });
  },
  async hasFile(name) {
    const dir = await fileAccess();
    if (!dir) return true; // nowhere to put it: don't fetch it
    try {
      await dir.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  },
  async readFile(name) {
    const dir = await fileAccess();
    try {
      return dir ? await (await dir.getFileHandle(name)).getFile() : undefined;
    } catch {
      return undefined;
    }
  },
  async writeFile(name, blob) {
    const dir = await fileAccess();
    if (!dir) return false;
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await (handle as any).createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  },
});

// ---- What the engine remembers ----

const SEEN = "~seen:";

export const dexieState: SyncState = {
  async metas() {
    return (await db.sync.toArray()).filter((r) => !r.key.startsWith("~")) as unknown as SyncMeta[];
  },
  async putMetas(metas) {
    if (metas.length) await db.sync.bulkPut(metas as any);
  },
  async markPushed(metas) {
    await db.transaction("rw", db.sync, async () => {
      for (const meta of metas) {
        const current = (await db.sync.get(meta.key)) as unknown as SyncMeta | undefined;
        if (!current || current.at === meta.at) await db.sync.put(meta as any);
      }
    });
  },
  async seen(dir) {
    return ((await db.sync.get(`${SEEN}${dir}`))?.files as Record<string, number>) || {};
  },
  async setSeen(dir, files) {
    await db.sync.put({ key: `${SEEN}${dir}`, files });
  },
};

// Joining sync: this computer's library is replaced by the folder's.
export const clearLibrary = () =>
  pauseTracking(async () => {
    await db.transaction("rw", [db.chats, db.characters, db.worlds, db.adventures, db.settings, db.sync], async () => {
      await Promise.all([db.chats.clear(), db.characters.clear(), db.worlds.clear(), db.adventures.clear(), db.sync.clear()]);
      const keys = ((await db.settings.toCollection().primaryKeys()) as string[]).filter(syncedSetting);
      await db.settings.bulkDelete(keys);
    });
  });

export const forgetSyncState = () => db.sync.clear();
