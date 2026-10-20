import { NormalizedImage } from "../types";
import { ImageGenCallOptions } from "./types";

export interface CollectedReferences {
  images: NormalizedImage[];
  // The character each image belongs to, in the same order as `images`.
  // Only filled when the call names its characters (a group picture), since
  // a 1:1 chat has a single face and nothing to tell apart.
  names: (string | undefined)[];
}

// Flattens a call's reference photos into the single ordered list that the
// non-Gemini providers take, capped at what the model accepts. A group
// picture interleaves the characters (everyone's main photo first, then
// everyone's second photo, and so on), so a low cap still gets every face in
// rather than spending the whole budget on whoever comes first.
export const collectReferences = (opts: Pick<ImageGenCallOptions, "referenceImages" | "referenceCharacters">, limit: number): CollectedReferences => {
  const groups = (opts.referenceCharacters || []).filter((g) => g.images.length > 0);
  if (groups.length === 0) {
    const images = (opts.referenceImages || []).slice(0, Math.max(0, limit));
    return { images, names: images.map(() => undefined) };
  }

  const images: NormalizedImage[] = [];
  const names: (string | undefined)[] = [];
  const longest = Math.max(...groups.map((g) => g.images.length));
  for (let round = 0; round < longest && images.length < limit; round++) {
    for (const group of groups) {
      if (images.length >= limit) break;
      const image = group.images[round];
      if (!image) continue;
      images.push(image);
      names.push(group.name);
    }
  }
  return { images, names };
};

// A sentence telling the model which reference image shows whom, so a group
// picture puts each face on the right person. Empty for an unnamed list.
export const referenceLegend = (names: (string | undefined)[]): string => {
  if (!names.some(Boolean)) return "";
  const parts = names.map((name, i) => `image ${i + 1} is ${name || "an unnamed character"}`);
  return `Reference images, in order: ${parts.join("; ")}. Keep each person's face and look from their reference images.`;
};

// The prompt with the legend in front of it, when there is one.
export const withReferenceLegend = (prompt: string, names: (string | undefined)[]): string => {
  const legend = referenceLegend(names);
  return legend ? `${legend}\n\n${prompt}` : prompt;
};

export const toDataUri = (image: NormalizedImage): string => `data:${image.mimeType};base64,${image.data}`;

export const toBlob = (image: NormalizedImage): Blob => {
  const binary = atob(image.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: image.mimeType });
};

export const extensionFor = (mimeType: string): string => {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
};
