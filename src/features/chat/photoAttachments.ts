// Photos attached in the composer (#48). They're shrunk before they're kept
// on the message: a phone photo can be several megabytes, which would bloat
// the chat in IndexedDB and cost far more tokens than a model needs to see it.

export const MAX_PHOTOS = 4;
const MAX_SIDE = 1280;

const fileToDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const readPhoto = async (file: File): Promise<string> => {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  const original = await fileToDataUrl(file);
  // GIFs keep their animation; anything already small stays as it is.
  if (file.type === "image/gif") return original;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 500_000) return original;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return original;
  }
};
