import { resolveImageSrcToUrl } from "src/features/ai/utils/portraitUtils";

// Pictures go to the host app as PNG (#264), whatever the provider gave:
// JPEG and WebP are drawn onto a canvas and saved again as PNG.

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const isPngBytes = (bytes: Uint8Array) => PNG_MAGIC.every((b, i) => bytes[i] === b);

export const bytesToBase64 = (bytes: Uint8Array): string => {
  // In pieces: String.fromCharCode with a whole picture's bytes overflows
  // the call stack.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(binary);
};

const reencodeAsPng = async (blob: Blob): Promise<Blob> => {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't convert the picture.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("Couldn't convert the picture."))), "image/png"));
};

// Any picture reference the app keeps (data:, blob:, http(s): or local:) as
// base64 PNG without the data: prefix.
export const pngBase64For = async (src: string): Promise<string> => {
  const url = await resolveImageSrcToUrl(src);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Couldn't load the picture (${response.status}).`);
    const blob = await response.blob();
    let bytes = new Uint8Array(await blob.arrayBuffer());
    if (!isPngBytes(bytes)) bytes = new Uint8Array(await (await reencodeAsPng(blob)).arrayBuffer());
    return bytesToBase64(bytes);
  } finally {
    if (url !== src && url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
};
