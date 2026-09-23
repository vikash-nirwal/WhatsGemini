// PIN hashing for the app lock (see AppLock). PBKDF2 so a copied hash isn't
// trivially brute-forced back into a 4-6 digit PIN by a lookup table - though
// a short PIN is still guessable offline, which is why the UI calls this a
// privacy screen rather than protection for the data itself.
const ITERATIONS = 150_000;

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

export const newPinSalt = (): string => toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);

export const hashPin = async (pin: string, salt: string): Promise<string> => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
  return toHex(bits);
};
