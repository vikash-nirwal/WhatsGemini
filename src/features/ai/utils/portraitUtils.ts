import { dbService } from "../../../services/dbService";

// Parses the "WxH" strings this app already uses for pixel-dimension
// settings (see IMAGE_RESOLUTIONS/DEFAULT_PORTRAIT_SAVE_SIZE in constants.ts).
export const parseSize = (sizeStr: string, fallback = { width: 256, height: 342 }): { width: number; height: number } => {
  const match = sizeStr.match(/^(\d+)x(\d+)$/i);
  if (!match) return fallback;
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
};

// Loads an image (data:/blob:/object URL) and draws it "cover"-scaled and
// centered onto a canvas of the given pixel size, returning a PNG blob -
// i.e. a non-interactive equivalent of AvatarCropDialog's default (no pan/
// zoom) framing. Used by save paths that skip the interactive crop dialog
// for convenience (batch generation, the in-chat one-click fix).
export const autoCoverCropToBlob = (imageSrc: string, width: number, height: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context."));
        return;
      }
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      ctx.drawImage(img, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Failed to export image."))), "image/png");
    };
    img.onerror = () => reject(new Error("Failed to load image."));
    img.src = imageSrc;
  });

// Converts a data: URL (e.g. straight from a provider's generateImage
// result) into a Blob, without any resizing.
export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const mimeMatch = dataUrl.match(/^data:(.*?);/);
  const base64 = dataUrl.split(",")[1] || "";
  return (await fetch(`data:${mimeMatch?.[1] || "image/png"};base64,${base64}`)).blob();
};

// Saves a blob into the user's configured Image Save Directory and returns
// the local: ref other components already know how to resolve (DisplayImage,
// appendCharacterImages). Throws if no directory is configured - callers
// show that as an inline error the same way AvatarCropDialog already does.
export const savePortraitBlob = async (blob: Blob, prefix: string): Promise<string> => {
  const dirHandle = await dbService.getSetting("image_save_directory");
  if (!dirHandle) {
    throw new Error("Set an Image Save Directory in Settings first.");
  }
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`;
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return `local:${filename}`;
};
