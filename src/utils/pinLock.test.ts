/**
 * @jest-environment node
 */
import { webcrypto } from "crypto";
import { hashPin, newPinSalt } from "./pinLock";

// The test runner's Node environment doesn't expose Web Crypto as a global.
if (!(globalThis as any).crypto?.subtle) (globalThis as any).crypto = webcrypto;

describe("pinLock", () => {
  it("hashes the same PIN and salt to the same value, and differs otherwise", async () => {
    const salt = newPinSalt();
    const a = await hashPin("1234", salt);
    expect(a).toBe(await hashPin("1234", salt));
    expect(a).not.toBe(await hashPin("1235", salt));
    expect(a).not.toBe(await hashPin("1234", newPinSalt()));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
