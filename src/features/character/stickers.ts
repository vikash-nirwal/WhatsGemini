import { Character } from "../../types";

// Character stickers (#137): a small set per character, drawn once in their
// locked look, one per mood. With a set drawn, a character now and then
// ends a reply with [Sticker: mood] instead of an emoji; it shows as the
// sticker, big and without a bubble.

export const STICKER_MOODS = ["happy", "laughing", "love", "sad", "annoyed", "eye roll"] as const;
export type StickerMood = (typeof STICKER_MOODS)[number];

export type Sticker = NonNullable<Character["stickers"]>[number];

// How a sticker is drawn: the portrait generator's hint, with the mood as
// its emotion.
export const stickerHint = (mood: string): string =>
  `A messaging-app sticker: the character as a die-cut cartoon sticker with a thick white outline, head and shoulders, big clear "${mood}" expression, plain flat background, no text`;

export const missingMoods = (stickers: Sticker[] | undefined): StickerMood[] =>
  STICKER_MOODS.filter((m) => !(stickers || []).some((s) => s.mood === m));

const STICKER_TAG = /\n*\[\s*sticker\s*:\s*([a-z ]{2,20})\]\s*$/i;
const STICKER_PARTIAL = /\n*\[\s*sticker\s*:[^\]\n]*$/i;

export const extractSticker = (text: string): { text: string; sticker?: string } => {
  const match = text.match(STICKER_TAG);
  if (!match) return { text };
  return { text: text.slice(0, match.index).trimEnd(), sticker: match[1].trim().toLowerCase() };
};

export const stripStreamingSticker = (text: string): string => text.replace(STICKER_TAG, "").replace(STICKER_PARTIAL, "");

export const buildStickerDirective = (charName: string, moods: string[]): string =>
  `${charName} has a sticker set (${moods.join(", ")}). Now and then, instead of an emoji, ${charName} can send one: end the reply with [Sticker: mood], using one of those moods exactly. Not every message - once in a while, when it says it better than words.`;

export const stickerFor = (character: Pick<Character, "stickers"> | undefined, mood: string | undefined): Sticker | undefined =>
  mood ? character?.stickers?.find((s) => s.mood === mood) : undefined;
