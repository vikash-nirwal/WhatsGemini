import { dbService } from "../../../services/dbService";
import { blobToDataUrl, isMediaRef } from "../../media/mediaRefs";
import { NormalizedImage } from "../types";

export const downscaleImageBase64 = async (base64Str: string, mimeType: string): Promise<string> => {
  try {
    // Decode image off the main thread
    const response = await fetch(`data:${mimeType};base64,${base64Str}`);
    const blob = await response.blob();
    const img = await createImageBitmap(blob);

    const MAX_WIDTH = 512;
    const MAX_HEIGHT = 512;
    let { width, height } = img;

    if (width <= MAX_WIDTH && height <= MAX_HEIGHT) {
      return base64Str; // No downscaling needed
    }

    if (width > height) {
      height = Math.round(height * (MAX_WIDTH / width));
      width = MAX_WIDTH;
    } else {
      width = Math.round(width * (MAX_HEIGHT / height));
      height = MAX_HEIGHT;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return base64Str;

    // Use high quality image interpolation
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    
    return canvas.toDataURL("image/jpeg", 0.7).split(',')[1];
  } catch (err) {
    console.warn("Downscale error, falling back to original:", err);
    return base64Str;
  }
};

export const appendCharacterImages = async (images: string[] | undefined): Promise<NormalizedImage[]> => {
  const result: NormalizedImage[] = [];
  if (images && images.length > 0) {
    for (const stored of images) {
      // A picture kept apart from its chat is read back as picture data
      // and goes the same way as one that was never moved.
      let imgRef = stored;
      if (isMediaRef(stored)) {
        try {
          imgRef = await blobToDataUrl(await dbService.getMediaBlob(stored));
        } catch (e) {
          console.error("Failed to load a stored picture for AI context:", e);
          continue;
        }
      }
      if (imgRef.startsWith('local:')) {
        try {
          const filename = imgRef.substring(6);
          const dirHandle = await dbService.getSetting("image_save_directory");
          if (dirHandle) {
            const fileHandle = await dirHandle.getFileHandle(filename);
            const file = await fileHandle.getFile();
            const buffer = await file.arrayBuffer();
            const base64d = btoa(
              new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            const ext = filename.split('.').pop()?.toLowerCase();
            let mimeType = 'image/png';
            if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
            else if (ext === 'webp') mimeType = 'image/webp';

            const downscaledBase64 = await downscaleImageBase64(base64d, mimeType);

            result.push({
              mimeType: "image/jpeg", // downscaled toDataURL gives jpeg
              data: downscaledBase64
            });
          }
        } catch (e) {
          console.error("Failed to load local character image for AI context:", e);
        }
      } else {
        const mimeMatch = imgRef.match(/data:(.*?);base64,/);
        if (mimeMatch) {
          const mimeType = mimeMatch[1];
          const rawBase64 = imgRef.split(',')[1];
          const downscaledBase64 = await downscaleImageBase64(rawBase64, mimeType);

          result.push({
            mimeType: "image/jpeg", // downscaled gives jpeg
            data: downscaledBase64
          });
        }
      }
    }
  }
  return result;
};
