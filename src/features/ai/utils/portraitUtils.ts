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

// Converts a Blob into a data: URL - the inverse of dataUrlToBlob, used
// when a freshly-picked/derived file needs to become a portable
// appearanceImages entry (no Image Save Directory required to read it back).
export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(blob);
  });

// Resolves any srcContext this app uses (data:/blob:/http URL as-is, local:
// via the configured Image Save Directory) into something a plain <img src>
// or canvas load can use. Mirrors DisplayImage's own resolution logic for
// call sites that need it imperatively rather than as a React component.
export const resolveImageSrcToUrl = async (srcContext: string): Promise<string> => {
  if (!srcContext.startsWith("local:")) return srcContext;
  const dirHandle = await dbService.getSetting("image_save_directory");
  if (!dirHandle) throw new Error("Set an Image Save Directory in Settings first.");
  const filename = srcContext.substring(6);
  const fileHandle = await dirHandle.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return URL.createObjectURL(file);
};

// Renders a plain accent-gradient-and-initials portrait (the same look
// CharacterAvatar's fallback uses) as a PNG blob - a base image for a
// Character Card PNG export when the character has no uploaded/generated
// portrait to embed the card data into.
export const generatePlaceholderPortraitBlob = (name: string, accent: [string, string] = ["#10B981", "#0EA5A0"]): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 533;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Failed to get canvas context."));
      return;
    }
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, accent[0]);
    gradient.addColorStop(1, accent[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const initials = (name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "bold 160px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, canvas.width / 2, canvas.height / 2);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Failed to export image."))), "image/png");
  });

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
