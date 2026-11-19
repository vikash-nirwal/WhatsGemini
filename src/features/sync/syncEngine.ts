import { fileNameFor, sealParts, unsealParts } from "./syncCrypto";
import { SyncFolder } from "./syncFolder";

// Two-way sync between computers through a shared folder (#274, the user's
// ask, 2026-11-19). There's no server, so the folder is the meeting point:
// each record (a chat, a character, a world, an adventure, a timeline, your
// personas) is one sealed file, written when it changes here and read when
// its file changes there. The newer version of a record wins; a chat that
// changed on both computers keeps the losing version as a copy, so no
// message is lost. Pictures are files of their own, written once, so a
// character's pictures aren't uploaded again each time their points change.
//
// Folder layout (inside SYNC_DIR):
//   r/  records       {k, at, dev, del?, v?}
//   m/  stored pictures (the media table), by id
//   p/  pictures inside records, taken out for the trip
//   f/  pictures from the save folder ("local:" refs)

export interface SyncMeta {
  key: string;
  // The version this computer has: when it changed here, or the version
  // last taken from the folder.
  at: number;
  // Changed here and not yet written to the folder.
  dirty: 0 | 1;
  del?: 1;
  // For records watched by comparing (prefs): what it was last time.
  json?: string;
}

// This computer's library, as records by key ("chats:12", "prefs", ...).
export interface SyncLocal {
  keys(): Promise<string[]>;
  get(key: string): Promise<unknown | undefined>;
  // Taking a version from the folder. Neither marks the record changed.
  put(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  // Keeps this computer's version of a chat as a new chat, when the other
  // computer's version wins over changes made here too.
  keepCopy(key: string, value: unknown): Promise<void>;
  // Records whose changes are found by comparing, not by being told.
  watched: string[];
  mediaIds(): Promise<string[]>;
  getMedia(id: string): Promise<Blob | undefined>;
  putMedia(id: string, blob: Blob): Promise<void>;
  // The save folder, when this computer has one.
  hasFile?(name: string): Promise<boolean>;
  readFile?(name: string): Promise<Blob | undefined>;
  writeFile?(name: string, blob: Blob): Promise<boolean>;
}

// What the engine remembers between runs.
export interface SyncState {
  metas(): Promise<SyncMeta[]>;
  putMetas(metas: SyncMeta[]): Promise<void>;
  // Written to the folder: no longer dirty, unless it changed again here
  // meanwhile (its version moved on), when it's written next time.
  markPushed(metas: SyncMeta[]): Promise<void>;
  seen(dir: string): Promise<Record<string, number>>;
  setSeen(dir: string, seen: Record<string, number>): Promise<void>;
}

interface RecordHead {
  k: string;
  at: number;
  dev: string;
  del?: 1;
  v?: unknown;
}

interface PictureHead {
  k: string;
  type: string;
}

// A picture taken out of a record for the trip, and put back on arrival.
const PIC = "kindred-syncpic:";
// Long enough to be a picture, not a short data URL like an icon.
const MIN_PICTURE = 4096;
const isPicture = (s: string) => s.length >= MIN_PICTURE && /^data:(image|video)\//.test(s);
const LOCAL = "local:";

const mapStrings = async (value: unknown, fn: (s: string) => Promise<string>, depth = 0): Promise<unknown> => {
  if (depth > 40 || value == null) return value;
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return Promise.all(value.map((v) => mapStrings(v, fn, depth + 1)));
  if (typeof value === "object" && !(value instanceof Blob)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = await mapStrings(v, fn, depth + 1);
    return out;
  }
  return value;
};

const stringsIn = (value: unknown, pick: (s: string) => boolean, found: Set<string> = new Set(), depth = 0): Set<string> => {
  if (depth > 40 || value == null) return found;
  if (typeof value === "string") {
    if (pick(value)) found.add(value);
  } else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, pick, found, depth + 1));
  else if (typeof value === "object" && !(value instanceof Blob)) Object.values(value as Record<string, unknown>).forEach((v) => stringsIn(v, pick, found, depth + 1));
  return found;
};

// A picture's id, the same on every computer. Hashing all of it would copy
// and read a character's 20 MB of pictures on every save (several a reply),
// so the fingerprint is its length and 16 samples spread across it; two
// different pictures don't share all of those.
const SAMPLES = 16;
const SAMPLE = 96;
export const pictureId = async (dataUrl: string): Promise<string> => {
  const step = Math.max(1, Math.floor((dataUrl.length - SAMPLE) / (SAMPLES - 1)));
  let sampled = `${dataUrl.length}|`;
  for (let i = 0; i < SAMPLES; i++) sampled += dataUrl.slice(i * step, i * step + SAMPLE);
  sampled += dataUrl.slice(-SAMPLE);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sampled)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
};

const dataUrlParts = (dataUrl: string): { type: string; bytes: Uint8Array } => {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const type = header.match(/^data:([^;,]+)/)?.[1] || "application/octet-stream";
  const body = dataUrl.slice(comma + 1);
  if (!/;base64/i.test(header)) return { type, bytes: new TextEncoder().encode(decodeURIComponent(body)) };
  const binary = atob(body.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { type, bytes };
};

const bytesToDataUrl = (type: string, bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return `data:${type};base64,${btoa(binary)}`;
};

// A Blob's bytes, where the browser (or a test's) has no arrayBuffer().
export const blobBytes = async (blob: Blob): Promise<Uint8Array> =>
  new Uint8Array(
    typeof blob.arrayBuffer === "function"
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(blob);
        })
  );

// Canonical files are a fingerprint and ".kbin"; Drive names a copy it
// couldn't reconcile "name (1).kbin".
const isCanonical = (name: string) => /^[0-9a-f]{24}\.kbin$/.test(name);

// Picture files go missing only while Drive is still bringing them over.
class NotYetHere extends Error {}

export interface SyncEngineOptions {
  folder: SyncFolder;
  local: SyncLocal;
  state: SyncState;
  key: CryptoKey;
  salt: Uint8Array;
  device: string;
  now?: () => number;
}

export const createSyncEngine = ({ folder, local, state, key, salt, device, now = Date.now }: SyncEngineOptions) => {
  const names = new Map<string, string>();
  const nameOf = async (recordKey: string) => {
    let name = names.get(recordKey);
    if (!name) names.set(recordKey, (name = await fileNameFor(salt, recordKey)));
    return name;
  };
  const metaMap = async () => new Map((await state.metas()).map((m) => [m.key, m]));

  // Records watched by comparing: changed when they differ from last time.
  const checkWatched = async (metas: Map<string, SyncMeta>) => {
    const changed: SyncMeta[] = [];
    for (const k of local.watched) {
      const value = await local.get(k);
      if (value === undefined) continue;
      const json = JSON.stringify(value);
      const meta = metas.get(k);
      if (meta?.json === json) continue;
      const next: SyncMeta = { key: k, at: now(), dirty: 1, json };
      metas.set(k, next);
      changed.push(next);
    }
    if (changed.length) await state.putMetas(changed);
  };

  // ---- Pictures ----

  // `bytes` is only read when the folder doesn't have the picture yet.
  const writePicture = async (dir: string, recordKey: string, bytes: () => Promise<{ type: string; bytes: Uint8Array } | undefined>, present: Set<string>) => {
    const name = await nameOf(recordKey);
    if (present.has(name)) return;
    const pic = await bytes();
    if (!pic) return;
    await folder.write(dir, name, await sealParts(key, { k: recordKey, type: pic.type } as PictureHead, pic.bytes));
    present.add(name);
  };
  const blobPicture = async (blob: Blob | undefined) => (blob ? { type: blob.type || "image/png", bytes: await blobBytes(blob) } : undefined);

  const readPicture = async (dir: string, recordKey: string): Promise<{ type: string; bytes: Uint8Array } | undefined> => {
    const data = await folder.read(dir, await nameOf(recordKey));
    if (!data) return undefined;
    const { head, tail } = await unsealParts<PictureHead>(key, data);
    return { type: head.type, bytes: tail };
  };

  // ---- Writing ----

  const push = async (): Promise<number> => {
    const metas = await metaMap();
    await checkWatched(metas);
    const dirty = Array.from(metas.values()).filter((m) => m.dirty);
    const seen = await state.seen("r");
    const pics = new Set(await folder.names("p"));
    const files = new Set(await folder.names("f"));
    const done: SyncMeta[] = [];
    for (const meta of dirty) {
      const value = meta.del ? undefined : await local.get(meta.key);
      const head: RecordHead = { k: meta.key, at: meta.at, dev: device };
      if (value === undefined) head.del = 1;
      else {
        // Pictures go in files of their own, written once.
        head.v = await mapStrings(value, async (s) => {
          if (!isPicture(s)) return s;
          const id = await pictureId(s);
          await writePicture("p", `pic:${id}`, async () => dataUrlParts(s), pics);
          return `${PIC}${id}`;
        });
        if (local.readFile) {
          for (const ref of Array.from(stringsIn(value, (s) => s.startsWith(LOCAL)))) {
            const name = ref.slice(LOCAL.length);
            const read = local.readFile;
            await writePicture("f", `file:${name}`, async () => blobPicture(await read(name)), files);
          }
        }
      }
      const name = await nameOf(meta.key);
      seen[name] = await folder.write("r", name, await sealParts(key, head));
      done.push({ ...meta, dirty: 0, ...(head.del ? { del: 1 as const } : {}) });
    }
    // Stored pictures: each written once, by id.
    const media = new Set(await folder.names("m"));
    for (const id of await local.mediaIds()) {
      await writePicture("m", `media:${id}`, async () => blobPicture(await local.getMedia(id)), media);
    }
    if (done.length) await state.markPushed(done);
    await state.setSeen("r", seen);
    return done.length;
  };

  // ---- Reading ----

  const restorePictures = async (value: unknown, cache: Map<string, string>) =>
    mapStrings(value, async (s) => {
      if (!s.startsWith(PIC)) return s;
      const id = s.slice(PIC.length);
      if (!cache.has(id)) {
        const pic = await readPicture("p", `pic:${id}`);
        if (!pic) throw new NotYetHere();
        cache.set(id, bytesToDataUrl(pic.type, pic.bytes));
      }
      return cache.get(id)!;
    });

  const bringFiles = async (value: unknown) => {
    if (!local.writeFile || !local.hasFile) return;
    for (const ref of Array.from(stringsIn(value, (s) => s.startsWith(LOCAL)))) {
      const name = ref.slice(LOCAL.length);
      if (await local.hasFile(name)) continue;
      const pic = await readPicture("f", `file:${name}`);
      if (pic) await local.writeFile(name, new Blob([pic.bytes as BlobPart], { type: pic.type }));
    }
  };

  // Takes what changed in the folder. Returns the keys changed here.
  const pull = async (): Promise<Set<string>> => {
    const metas = await metaMap();
    await checkWatched(metas);
    const seen = await state.seen("r");
    const changed = new Set<string>();
    const touched: SyncMeta[] = [];
    const cache = new Map<string, string>();
    // Canonical files first, so a copy Drive made is weighed against them.
    const entries = (await folder.list("r")).sort((a, b) => Number(isCanonical(b.name)) - Number(isCanonical(a.name)));
    for (const entry of entries) {
      if (seen[entry.name] === entry.modified) continue;
      const data = await folder.read("r", entry.name);
      if (!data) continue;
      const { head } = await unsealParts<RecordHead>(key, data);
      const copy = !isCanonical(entry.name);
      const meta = metas.get(head.k);
      let next: SyncMeta | undefined;
      if (!meta || head.at > meta.at) {
        try {
          const value = head.del ? undefined : await restorePictures(head.v, cache);
          // Changed here too: a chat keeps this computer's version as a copy.
          if (meta?.dirty && !meta.del && head.k.startsWith("chats:")) {
            const mine = await local.get(head.k);
            if (mine !== undefined) await local.keepCopy(head.k, mine);
          }
          if (head.del) await local.remove(head.k);
          else {
            await local.put(head.k, value);
            await bringFiles(head.v);
          }
        } catch (err) {
          if (err instanceof NotYetHere) continue; // tried again next time
          throw err;
        }
        const watchedJson = local.watched.includes(head.k) ? JSON.stringify((await local.get(head.k)) ?? null) : undefined;
        // A copy that won is written back as the record's own file.
        next = { key: head.k, at: head.at, dirty: copy ? 1 : 0, ...(head.del ? { del: 1 as const } : {}), ...(watchedJson !== undefined ? { json: watchedJson } : {}) };
        changed.add(head.k);
      } else if (head.at < meta.at && !meta.dirty) {
        // The folder has an older version than this computer: write ours.
        next = { ...meta, dirty: 1 };
      }
      if (next) {
        metas.set(head.k, next);
        touched.push(next);
      }
      if (copy) await folder.remove("r", entry.name);
      else seen[entry.name] = entry.modified;
    }
    // Stored pictures this computer doesn't have yet.
    const have = new Set(await local.mediaIds());
    const seenM = await state.seen("m");
    for (const entry of await folder.list("m")) {
      if (seenM[entry.name] === entry.modified) continue;
      const data = await folder.read("m", entry.name);
      if (!data) continue;
      const { head, tail } = await unsealParts<PictureHead>(key, data);
      const id = head.k.replace(/^media:/, "");
      if (!have.has(id)) await local.putMedia(id, new Blob([tail as BlobPart], { type: head.type }));
      seenM[entry.name] = entry.modified;
    }
    if (touched.length) await state.putMetas(touched);
    await state.setSeen("r", seen);
    await state.setSeen("m", seenM);
    return changed;
  };

  // The first computer: everything here goes to the folder.
  const seedAll = async () => {
    const at = now();
    const metas = await Promise.all((await local.keys()).map(async (k) => {
      const json = local.watched.includes(k) ? JSON.stringify((await local.get(k)) ?? null) : undefined;
      return { key: k, at, dirty: 1 as const, ...(json !== undefined ? { json } : {}) };
    }));
    await state.putMetas(metas);
  };

  // A computer joining: what the folder has wins over its own watched
  // records (your personas), which it had before it joined.
  const yieldWatched = async () => {
    const metas = await Promise.all(local.watched.map(async (k) => ({ key: k, at: 0, dirty: 0 as const, json: JSON.stringify((await local.get(k)) ?? null) })));
    await state.putMetas(metas);
  };

  return { push, pull, seedAll, yieldWatched };
};

export type SyncEngine = ReturnType<typeof createSyncEngine>;

// ---- The folder's header ----

// The folder's own file: its salt in the clear (the key is made from the
// code and the salt), then a sealed note that tells whether a typed code is
// the right one.
const HEADER = "kindred.kbin";
const HEADER_MAGIC = [0x4b, 0x53, 0x59, 0x48]; // "KSYH"

export const readHeaderSalt = async (folder: SyncFolder): Promise<Uint8Array | undefined> => {
  const data = await folder.read("", HEADER);
  if (!data || data.length < 20 || HEADER_MAGIC.some((b, i) => data[i] !== b)) return undefined;
  return data.slice(4, 20);
};

export const writeHeader = async (folder: SyncFolder, key: CryptoKey, salt: Uint8Array): Promise<void> => {
  const sealed = await sealParts(key, { kind: "kindred-sync", created: Date.now() });
  const out = new Uint8Array(20 + sealed.length);
  out.set(HEADER_MAGIC, 0);
  out.set(salt, 4);
  out.set(sealed, 20);
  await folder.write("", HEADER, out);
};

// Throws WrongSyncCodeError when the key isn't the folder's.
export const checkHeader = async (folder: SyncFolder, key: CryptoKey): Promise<void> => {
  const data = await folder.read("", HEADER);
  if (!data) throw new Error("This folder has no Kindred sync in it.");
  const { head } = await unsealParts<{ kind?: string }>(key, data.slice(20));
  if (head.kind !== "kindred-sync") throw new Error("This folder has no Kindred sync in it.");
};
