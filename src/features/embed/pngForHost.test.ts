import { bytesToBase64, isPngBytes } from "./pngForHost";

describe("pngForHost", () => {
  it("knows a PNG by its first bytes", () => {
    expect(isPngBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true);
    expect(isPngBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
  });

  it("writes base64 for big pictures in pieces", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    const b64 = bytesToBase64(bytes);
    expect(Buffer.from(b64, "base64").equals(Buffer.from(bytes))).toBe(true);
  });
});
