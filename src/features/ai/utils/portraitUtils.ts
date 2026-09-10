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

// Chroma-key color emotion portraits are generated against (see
// generateAvatarImage's emotion-only prompt clause in aiSlice.ts) - pure
// magenta rather than the traditional green-screen green, since green shows
// up far more often in character coloring (eyes, clothing, magic effects)
// and would get incorrectly punched out along with the real background.
export const CHROMA_KEY_COLOR: [number, number, number] = [255, 0, 255];

// Distance (max-channel, 0-255) from CHROMA_KEY_COLOR within which a pixel is
// fully keyed out, and the wider distance it's feathered out to (linear alpha
// ramp) so the cutout edge isn't a hard, jagged line.
const FULL_KEY_DISTANCE = 40;
const FEATHER_KEY_DISTANCE = 90;

// Converts a chroma-keyed image (a solid CHROMA_KEY_COLOR background, from an
// AI-generated emotion portrait) into a real alpha-transparent PNG blob, by
// keying out pixels close to that color. This is a plain color-distance key,
// not real matting - it can't perfectly separate fine hair-strand edges, and
// a character whose own coloring happens to land close to the key color will
// get incorrectly punched out too. "Regenerate for a cleaner result" is the
// expected fallback when a specific portrait doesn't key out well, same as
// this app already expects for occasional bad framing on a generated portrait.
export const removeChromaKeyBackground = (
  imageSrc: string,
  keyColor: [number, number, number] = CHROMA_KEY_COLOR
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context."));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      const [kr, kg, kb] = keyColor;
      for (let i = 0; i < data.length; i += 4) {
        const dist = Math.max(Math.abs(data[i] - kr), Math.abs(data[i + 1] - kg), Math.abs(data[i + 2] - kb));
        if (dist <= FULL_KEY_DISTANCE) {
          data[i + 3] = 0;
        } else if (dist < FEATHER_KEY_DISTANCE) {
          const t = (dist - FULL_KEY_DISTANCE) / (FEATHER_KEY_DISTANCE - FULL_KEY_DISTANCE);
          data[i + 3] = Math.round(data[i + 3] * t);
        }
      }
      ctx.putImageData(imageData, 0, 0);
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
