// Locking the sync folder (the user's ask, 2026-11-19): the folder sits in
// Google Drive, where anyone looking at the Drive (or the files on disk)
// shouldn't be able to read the chats. Every file is sealed with AES-GCM, the
// browser's own encryption, under a key made from a short sync code. The
// code is made on the first computer and typed once on each other one; it's
// kept on the device, so nobody types it again. It isn't meant to stop a
// determined attacker who has the device, only to make the files in the
// Drive unreadable to anyone without the code.

// Letters and digits that can't be mistaken for each other when typed.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 12;

export const makeSyncCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return chars.match(/.{4}/g)!.join("-");
};

// The code as typed: case, spaces and dashes don't matter.
export const normalizeSyncCode = (typed: string): string => typed.toUpperCase().replace(/[^A-Z0-9]/g, "");

const ITERATIONS = 150_000;

export const deriveSyncKey = async (code: string, salt: Uint8Array): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalizeSyncCode(code)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
};

export class WrongSyncCodeError extends Error {
  constructor() {
    super("That sync code doesn't open this sync folder.");
  }
}

// "KSY1", then a flag byte (1 when the content was compressed), a 12-byte
// IV and the AES-GCM ciphertext.
const MAGIC = [0x4b, 0x53, 0x59, 0x31];

const squeeze = async (bytes: Uint8Array, how: "compress" | "decompress"): Promise<Uint8Array> => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(how === "compress" ? new CompressionStream("gzip") : new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};
const canSqueeze = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined" && typeof Response !== "undefined";

export const seal = async (key: CryptoKey, plain: Uint8Array): Promise<Uint8Array> => {
  // Chats are mostly text, which shrinks to a fraction: less to upload.
  const compressed = canSqueeze();
  const body = compressed ? await squeeze(plain, "compress") : plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, body as BufferSource));
  const out = new Uint8Array(MAGIC.length + 1 + iv.length + cipher.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = compressed ? 1 : 0;
  out.set(iv, MAGIC.length + 1);
  out.set(cipher, MAGIC.length + 1 + iv.length);
  return out;
};

export const unseal = async (key: CryptoKey, data: Uint8Array): Promise<Uint8Array> => {
  if (data.length < MAGIC.length + 13 || MAGIC.some((b, i) => data[i] !== b)) throw new Error("Not a Kindred sync file.");
  const compressed = data[MAGIC.length] === 1;
  const iv = data.slice(MAGIC.length + 1, MAGIC.length + 13);
  let body: Uint8Array;
  try {
    body = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data.slice(MAGIC.length + 13)));
  } catch {
    throw new WrongSyncCodeError();
  }
  return compressed ? squeeze(body, "decompress") : body;
};

// A sealed file holds a JSON head and, for a picture, its bytes after it:
// the head's length (4 bytes), the head, then the bytes.
export const sealParts = async (key: CryptoKey, head: unknown, tail?: Uint8Array): Promise<Uint8Array> => {
  const json = new TextEncoder().encode(JSON.stringify(head));
  const plain = new Uint8Array(4 + json.length + (tail?.length || 0));
  new DataView(plain.buffer).setUint32(0, json.length);
  plain.set(json, 4);
  if (tail) plain.set(tail, 4 + json.length);
  return seal(key, plain);
};

export const unsealParts = async <T,>(key: CryptoKey, data: Uint8Array): Promise<{ head: T; tail: Uint8Array }> => {
  const plain = await unseal(key, data);
  const length = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(0);
  return { head: JSON.parse(new TextDecoder().decode(plain.subarray(4, 4 + length))) as T, tail: plain.subarray(4 + length) };
};

// File names say nothing about what's inside: a fingerprint of the record's
// key with the folder's own salt, so "chats:12" isn't guessable either.
export const fileNameFor = async (salt: Uint8Array, recordKey: string): Promise<string> => {
  const keyBytes = new TextEncoder().encode(recordKey);
  const all = new Uint8Array(salt.length + keyBytes.length);
  all.set(salt, 0);
  all.set(keyBytes, salt.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", all));
  return `${Array.from(digest.subarray(0, 12), (b) => b.toString(16).padStart(2, "0")).join("")}.kbin`;
};
