import { dbService } from "../../services/dbService";
import { getFullBackupData, restoreLibrary, BackupData } from "../../services/backupService";
import { deriveSyncKey, makeSyncCode, WrongSyncCodeError } from "./syncCrypto";
import { checkHeader, createSyncEngine, readHeaderSalt, SyncEngine, writeHeader } from "./syncEngine";
import { handleFolder, openSyncRoot } from "./syncFolder";
import { clearLibrary, dexieLocal, dexieState, forgetSyncState, installSyncHooks, onLocalChange, PrefsBinding, setSyncOn, syncIsOn } from "./syncLocal";

// Running sync between computers (#274): turning it on (a new sync folder,
// or joining one another computer made), the loop that reads and writes the
// folder while the app is open, and the folder permission the browser asks
// for again after a reload.

export const LS_SYNC_CODE = "kindred_sync_code";
export const LS_SYNC_DEVICE = "kindred_sync_device";
const FOLDER_SETTING = "sync_folder";
// How often the folder is read while the app is open, besides on coming
// back to the tab; a change here is written a few seconds after it's saved.
const PULL_EVERY = 30_000;
const PUSH_AFTER = 3_000;

export type SyncPhase = "off" | "needs-permission" | "syncing" | "idle" | "error";
export interface SyncStatus {
  phase: SyncPhase;
  lastSyncAt?: number;
  error?: string;
}

let status: SyncStatus = { phase: syncIsOn() ? "needs-permission" : "off" };
const watchers = new Set<(s: SyncStatus) => void>();
const setStatus = (next: Partial<SyncStatus>) => {
  status = { ...status, ...next };
  watchers.forEach((fn) => fn(status));
};
export const syncStatus = () => status;
export const watchSync = (fn: (s: SyncStatus) => void) => {
  watchers.add(fn);
  return () => void watchers.delete(fn);
};

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // Private mode.
  }
};

export const syncCode = () => read(LS_SYNC_CODE) || "";
const deviceId = () => {
  let id = read(LS_SYNC_DEVICE);
  if (!id) write(LS_SYNC_DEVICE, (id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`));
  return id;
};

// Changes are noted from the first save, before sync has started.
installSyncHooks();

export const folderSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

// ---- The app's side ----

export interface SyncHost {
  prefs: PrefsBinding;
  // Records taken from the folder, by key, for the app to reload.
  onApplied(keys: Set<string>): void;
}
let host: SyncHost | undefined;

// ---- The loop ----

let engine: SyncEngine | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let unlisten: (() => void) | undefined;
let running: Promise<void> | undefined;

// One tab syncs at a time; the others' changes are in the shared database.
const withLock = async (work: () => Promise<void>) => {
  const locks = (navigator as any).locks;
  if (!locks?.request) return work();
  await locks.request("kindred-sync", { ifAvailable: true }, async (lock: unknown) => {
    if (lock) await work();
  });
};

export const syncNow = async (): Promise<void> => {
  if (!engine) return;
  if (running) return running;
  const current = engine;
  running = withLock(async () => {
    setStatus({ phase: "syncing" });
    try {
      const changed = await current.pull();
      if (changed.size) host?.onApplied(changed);
      await current.push();
      setStatus({ phase: "idle", lastSyncAt: Date.now(), error: undefined });
    } catch (err) {
      console.warn("Sync failed:", err);
      setStatus({ phase: "error", error: err instanceof WrongSyncCodeError ? "The sync code on this computer no longer opens the sync folder." : err instanceof Error ? err.message : String(err) });
    }
  }).finally(() => {
    running = undefined;
  });
  return running;
};

const onVisible = () => {
  if (document.visibilityState === "visible") void syncNow();
};

const run = (next: SyncEngine) => {
  stopLoop();
  engine = next;
  timer = setInterval(() => void syncNow(), PULL_EVERY);
  unlisten = onLocalChange(() => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void syncNow(), PUSH_AFTER);
  });
  document.addEventListener("visibilitychange", onVisible);
  return syncNow();
};

const stopLoop = () => {
  if (timer) clearInterval(timer);
  if (pushTimer) clearTimeout(pushTimer);
  unlisten?.();
  document.removeEventListener("visibilitychange", onVisible);
  timer = pushTimer = unlisten = undefined;
  engine = undefined;
};

const engineFor = async (picked: FileSystemDirectoryHandle, code: string): Promise<SyncEngine> => {
  const root = await openSyncRoot(picked, false);
  if (!root) throw new Error("The sync folder isn't there any more.");
  const folder = handleFolder(root);
  const salt = await readHeaderSalt(folder);
  if (!salt) throw new Error("This folder has no Kindred sync in it.");
  const key = await deriveSyncKey(code, salt);
  await checkHeader(folder, key);
  return createSyncEngine({ folder, local: dexieLocal(host!.prefs), state: dexieState, key, salt, device: deviceId() });
};

const permitted = async (handle: FileSystemDirectoryHandle, ask: boolean) => {
  const opts = { mode: "readwrite" };
  const h = handle as any;
  if ((await h.queryPermission?.(opts)) === "granted") return true;
  return ask ? (await h.requestPermission?.(opts)) === "granted" : false;
};

// On opening the app: picks up where it left off, if the browser still
// allows the folder. Otherwise it waits for resumeSync, from a click.
export const startSync = async (appHost: SyncHost): Promise<void> => {
  host = appHost;
  installSyncHooks();
  if (!syncIsOn()) return setStatus({ phase: "off" });
  const handle = (await dbService.getSetting(FOLDER_SETTING)) as FileSystemDirectoryHandle | undefined;
  if (!handle) return setStatus({ phase: "error", error: "The sync folder was forgotten. Turn sync off and on again." });
  if (!(await permitted(handle, false))) return setStatus({ phase: "needs-permission" });
  try {
    await run(await engineFor(handle, syncCode()));
  } catch (err) {
    setStatus({ phase: "error", error: err instanceof Error ? err.message : String(err) });
  }
};

// After a reload the browser may ask again before the app can use the
// folder; it only asks from a click.
export const resumeSync = async (): Promise<void> => {
  const handle = (await dbService.getSetting(FOLDER_SETTING)) as FileSystemDirectoryHandle | undefined;
  if (!handle || !(await permitted(handle, true))) return;
  try {
    await run(await engineFor(handle, syncCode()));
  } catch (err) {
    setStatus({ phase: "error", error: err instanceof Error ? err.message : String(err) });
  }
};

// ---- Turning it on ----

// Whether the picked folder already has sync from another computer in it.
export const folderHasSync = async (picked: FileSystemDirectoryHandle): Promise<boolean> => {
  const root = await openSyncRoot(picked, false);
  return Boolean(root && (await readHeaderSalt(handleFolder(root))));
};

// The first computer: makes the sync folder and sends the whole library.
// Returns the code to type on the other computers.
export const createSync = async (picked: FileSystemDirectoryHandle): Promise<string> => {
  const root = (await openSyncRoot(picked, true))!;
  const folder = handleFolder(root);
  const code = makeSyncCode();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await writeHeader(folder, await deriveSyncKey(code, salt), salt);
  await forgetSyncState();
  await dbService.setSetting(FOLDER_SETTING, picked);
  write(LS_SYNC_CODE, code);
  setSyncOn(true);
  const next = await engineFor(picked, code);
  await next.seedAll();
  await run(next);
  return code;
};

// Another computer: checks the code, then either takes the folder's library
// in place of this one's, or takes it and adds this one's to it (the way a
// backup is restored: matching people and chats aren't doubled).
export const joinSync = async (picked: FileSystemDirectoryHandle, code: string, keepMine: boolean): Promise<void> => {
  // Throws on a wrong code before anything here changes.
  await engineFor(picked, code);
  const mine: BackupData | undefined = keepMine ? await getFullBackupData() : undefined;
  await dbService.setSetting(FOLDER_SETTING, picked);
  write(LS_SYNC_CODE, code);
  setSyncOn(true);
  await clearLibrary();
  const next = await engineFor(picked, code);
  await next.yieldWatched();
  setStatus({ phase: "syncing" });
  const changed = await next.pull();
  // This computer's own, added as new records (sync is on, so they get ids
  // the other computers don't use) and written to the folder by the loop.
  if (mine) await restoreLibrary(mine);
  host?.onApplied(new Set([...Array.from(changed), "chats:", "characters:", "worlds:", "adventures:", "settings:channels", "settings:my_statuses"]));
  await run(next);
};

// Off: this computer keeps its library and stops reading and writing the
// folder. The folder and the other computers are left as they are.
export const stopSync = async (): Promise<void> => {
  stopLoop();
  setSyncOn(false);
  write(LS_SYNC_CODE, null);
  await forgetSyncState();
  await dbService.setSetting(FOLDER_SETTING, undefined);
  setStatus({ phase: "off", lastSyncAt: undefined, error: undefined });
};
