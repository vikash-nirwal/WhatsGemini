// Backup to Google Drive (#54). The full backup zip is encrypted in the
// browser with a passphrase only the user knows, then stored in the Drive's
// hidden app-data folder, which only this app can see. There's no server:
// Google's own sign-in popup (Google Identity Services) hands the page a
// short-lived token for that one folder, using an OAuth client ID the user
// creates once in Google Cloud.

export const LS_GOOGLE_CLIENT_ID = "google_drive_client_id";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
// Older backups beyond this many are deleted after a new one is saved.
export const KEEP_BACKUPS = 5;

// ---- Encryption ----

// "WGBK1", the file marker.
const MAGIC = new Uint8Array([0x57, 0x47, 0x42, 0x4b, 0x31]);
const ITERATIONS = 250_000;

const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// Layout: "WGBK1", 16-byte salt, 12-byte IV, then AES-GCM ciphertext.
export const encryptBackup = async (data: ArrayBuffer, passphrase: string): Promise<Uint8Array> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  const out = new Uint8Array(MAGIC.length + salt.length + iv.length + cipher.length);
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + salt.length);
  out.set(cipher, MAGIC.length + salt.length + iv.length);
  return out;
};

export class WrongPassphraseError extends Error {
  constructor() {
    super("That passphrase doesn't open this backup.");
  }
}

export const decryptBackup = async (bytes: Uint8Array, passphrase: string): Promise<ArrayBuffer> => {
  const header = bytes.slice(0, MAGIC.length);
  if (header.length !== MAGIC.length || header.some((b, i) => b !== MAGIC[i])) throw new Error("This isn't a Kindred Drive backup.");
  const salt = bytes.slice(MAGIC.length, MAGIC.length + 16);
  const iv = bytes.slice(MAGIC.length + 16, MAGIC.length + 28);
  const key = await deriveKey(passphrase, salt);
  try {
    return await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bytes.slice(MAGIC.length + 28));
  } catch {
    throw new WrongPassphraseError();
  }
};

// ---- Google sign-in ----

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: { initTokenClient: (cfg: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string; error_description?: string }) => void; error_callback?: (e: { type?: string; message?: string }) => void }) => TokenClient } } };
  }
}

const loadGis = (): Promise<void> =>
  window.google?.accounts?.oauth2
    ? Promise.resolve()
    : new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = GIS_SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Couldn't load Google sign-in. Check your connection."));
        document.head.appendChild(script);
      });

let cachedToken: { token: string; expires: number } | null = null;

export const getDriveToken = async (clientId: string): Promise<string> => {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google sign-in didn't load.");
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error_description || r.error || "Google sign-in was cancelled."));
        // Tokens last about an hour; keep it for this page's session only.
        cachedToken = { token: r.access_token, expires: Date.now() + 55 * 60_000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.type === "popup_closed" ? "Google sign-in was closed." : e.message || "Google sign-in failed.")),
    });
    client.requestAccessToken();
  });
};

// For the daily backup while the app is open (#198): the token from this
// visit's sign-in, if it's still good - never a new sign-in, which would
// need you there - and the passphrase you used this visit, in memory only.
export const cachedDriveToken = (): string | undefined => (cachedToken && cachedToken.expires > Date.now() + 60_000 ? cachedToken.token : undefined);
let sessionPassphrase: string | undefined;
export const rememberPassphrase = (passphrase: string | undefined) => {
  sessionPassphrase = passphrase;
};
export const rememberedPassphrase = () => sessionPassphrase;

export const forgetDriveToken = () => {
  cachedToken = null;
};

// ---- Drive files ----

export interface DriveBackup {
  id: string;
  name: string;
  size?: number;
  createdTime: string;
}

const driveFetch = async (token: string, url: string, init: RequestInit = {}): Promise<Response> => {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) forgetDriveToken();
  if (!res.ok) throw new Error(`Google Drive said ${res.status}${res.statusText ? ` ${res.statusText}` : ""}.`);
  return res;
};

export const listDriveBackups = async (token: string): Promise<DriveBackup[]> => {
  const params = new URLSearchParams({ spaces: "appDataFolder", fields: "files(id,name,size,createdTime)", orderBy: "createdTime desc", pageSize: "50" });
  const res = await driveFetch(token, `${DRIVE}/files?${params}`);
  const data = await res.json();
  return (data.files || []).map((f: any) => ({ id: f.id, name: f.name, size: f.size ? Number(f.size) : undefined, createdTime: f.createdTime }));
};

export const uploadDriveBackup = async (token: string, bytes: Uint8Array, name: string): Promise<DriveBackup> => {
  const boundary = `wgbk${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, parents: ["appDataFolder"], mimeType: "application/octet-stream" });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    bytes as BlobPart,
    `\r\n--${boundary}--`,
  ]);
  const res = await driveFetch(token, `${UPLOAD}&fields=id,name,size,createdTime`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return res.json();
};

export const downloadDriveBackup = async (token: string, id: string): Promise<Uint8Array> => {
  const res = await driveFetch(token, `${DRIVE}/files/${encodeURIComponent(id)}?alt=media`);
  return new Uint8Array(await res.arrayBuffer());
};

export const deleteDriveBackup = async (token: string, id: string): Promise<void> => {
  await driveFetch(token, `${DRIVE}/files/${encodeURIComponent(id)}`, { method: "DELETE" });
};

// Keeps the newest few; failures here don't fail the backup itself.
export const pruneDriveBackups = async (token: string, keep = KEEP_BACKUPS): Promise<number> => {
  const backups = await listDriveBackups(token);
  const old = backups.slice(keep);
  for (const b of old) await deleteDriveBackup(token, b.id).catch(() => undefined);
  return old.length;
};
