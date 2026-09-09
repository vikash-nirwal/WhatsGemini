// Minimal PNG chunk reader/writer for a tEXt chunk by keyword - specifically
// the "chara" chunk convention used by TavernAI/SillyTavern-style Character
// Card PNGs (a base64 JSON payload tucked into an otherwise-normal, still
// viewable PNG). No image decoding involved - this only touches the PNG
// container's chunk structure.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const readUint32BE = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;

const pushUint32BE = (value: number, out: number[]) => {
  out.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
};

const isPng = (bytes: Uint8Array) => PNG_SIGNATURE.every((b, i) => bytes[i] === b);

// String.fromCharCode(...bytes) can blow the call stack for large arrays -
// a verbose character card's base64 payload can run tens of KB, so this
// walks it in batches instead of one big spread.
const bytesToLatin1 = (bytes: Uint8Array): string => {
  let result = "";
  const batch = 0x8000;
  for (let i = 0; i < bytes.length; i += batch) {
    result += String.fromCharCode(...bytes.subarray(i, i + batch));
  }
  return result;
};

// Reads a tEXt chunk's value by keyword (e.g. "chara"). Returns null if the
// buffer isn't a PNG or has no matching tEXt chunk.
export const readPngTextChunk = (buffer: ArrayBuffer, keyword: string): string | null => {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8 || !isPng(bytes)) return null;

  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    if (dataStart + length + 4 > bytes.length) break;

    if (type === "tEXt") {
      const chunkData = bytes.subarray(dataStart, dataStart + length);
      const nullIdx = chunkData.indexOf(0);
      if (nullIdx !== -1) {
        const chunkKeyword = String.fromCharCode(...chunkData.subarray(0, nullIdx));
        if (chunkKeyword === keyword) {
          return bytesToLatin1(chunkData.subarray(nullIdx + 1));
        }
      }
    }
    if (type === "IEND") break;
    offset = dataStart + length + 4; // skip data + CRC
  }
  return null;
};

// Returns a new PNG (as a Blob) with a tEXt chunk of the given
// keyword/text inserted right after IHDR - a valid position per the PNG
// spec, and where card-writing tools conventionally put it. `buffer` must
// already be a well-formed PNG (e.g. straight out of canvas.toBlob).
export const writePngTextChunk = (buffer: ArrayBuffer, keyword: string, text: string): Blob => {
  const bytes = new Uint8Array(buffer);
  if (!isPng(bytes)) throw new Error("Not a valid PNG file.");

  const ihdrLength = readUint32BE(bytes, 8);
  const ihdrEnd = 8 + 8 + ihdrLength + 4; // signature(8) + [len+type](8) + data + crc(4)
  if (ihdrEnd > bytes.length) throw new Error("Malformed PNG (truncated IHDR chunk).");

  // Built with typed-array .set() throughout (never a spread/push over the
  // full byte array) - the base64 payload of a verbose character card can
  // run tens of KB, well past what's safe to pass as spread arguments.
  const keywordBytes = Uint8Array.from(keyword, (c) => c.charCodeAt(0));
  const textBytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  const typeBytes = new Uint8Array([0x74, 0x45, 0x58, 0x74]); // "tEXt"

  const dataLength = keywordBytes.length + 1 + textBytes.length;
  const chunkData = new Uint8Array(dataLength);
  chunkData.set(keywordBytes, 0);
  chunkData[keywordBytes.length] = 0;
  chunkData.set(textBytes, keywordBytes.length + 1);

  const crcInput = new Uint8Array(typeBytes.length + chunkData.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(chunkData, typeBytes.length);
  const crc = crc32(crcInput);

  const newChunk = new Uint8Array(4 + 4 + dataLength + 4);
  const lengthBytes: number[] = [];
  pushUint32BE(dataLength, lengthBytes);
  newChunk.set(lengthBytes, 0);
  newChunk.set(typeBytes, 4);
  newChunk.set(chunkData, 8);
  const crcBytes: number[] = [];
  pushUint32BE(crc, crcBytes);
  newChunk.set(crcBytes, 8 + dataLength);

  const result = new Uint8Array(bytes.length + newChunk.length);
  result.set(bytes.subarray(0, ihdrEnd), 0);
  result.set(newChunk, ihdrEnd);
  result.set(bytes.subarray(ihdrEnd), ihdrEnd + newChunk.length);

  return new Blob([result], { type: "image/png" });
};
