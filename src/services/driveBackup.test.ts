import { webcrypto } from "crypto";
import { TextDecoder, TextEncoder } from "util";

// jsdom has no Web Crypto subtle API, and older ones no TextEncoder; Node's
// own are the same API.
Object.assign(globalThis, { TextEncoder, TextDecoder });
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

// eslint-disable-next-line import/first
import { decryptBackup, encryptBackup, listDriveBackups, pruneDriveBackups, WrongPassphraseError } from "./driveBackup";

const text = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("backup encryption", () => {
  it("round-trips with the right passphrase and hides the content", async () => {
    const sealed = await encryptBackup(text('{"characters":["Aria"]}'), "correct horse");
    expect(new TextDecoder().decode(sealed.slice(0, 5))).toBe("WGBK1");
    expect(new TextDecoder().decode(sealed)).not.toContain("Aria");
    const opened = await decryptBackup(sealed, "correct horse");
    expect(new TextDecoder().decode(opened)).toBe('{"characters":["Aria"]}');
  });

  it("refuses a wrong passphrase and a file that isn't a backup", async () => {
    const sealed = await encryptBackup(text("secret"), "right");
    await expect(decryptBackup(sealed, "wrong")).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(decryptBackup(new Uint8Array([1, 2, 3]), "right")).rejects.toThrow("isn't a Kindred Drive backup");
  });

  it("uses a fresh salt and IV every time", async () => {
    const a = await encryptBackup(text("same"), "p");
    const b = await encryptBackup(text("same"), "p");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe("Drive files", () => {
  const files = [
    { id: "6", name: "b6", createdTime: "2026-10-06" },
    { id: "5", name: "b5", createdTime: "2026-10-05" },
    { id: "4", name: "b4", createdTime: "2026-10-04" },
    { id: "3", name: "b3", createdTime: "2026-10-03" },
    { id: "2", name: "b2", createdTime: "2026-10-02", size: "10" },
    { id: "1", name: "b1", createdTime: "2026-10-01" },
  ];
  let calls: { url: string; method: string; auth: string | null }[];

  beforeEach(() => {
    calls = [];
    (global as any).fetch = async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method || "GET", auth: new Headers(init.headers).get("Authorization") });
      return { ok: true, status: 200, json: async () => ({ files }) } as any;
    };
  });

  it("lists backups in the app-data folder with the token", async () => {
    const list = await listDriveBackups("tok");
    expect(list).toHaveLength(6);
    expect(list[4].size).toBe(10);
    expect(calls[0].url).toContain("spaces=appDataFolder");
    expect(calls[0].auth).toBe("Bearer tok");
  });

  it("deletes all but the newest five", async () => {
    expect(await pruneDriveBackups("tok")).toBe(1);
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["https://www.googleapis.com/drive/v3/files/1"]);
  });
});
