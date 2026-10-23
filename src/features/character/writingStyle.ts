import { WritingStyle } from "../../types";

// How they write (#111): a per-character texting profile - message length,
// lowercase, punctuation, emoji, abbreviations, double-texting - set in the
// editor and put into every prompt, so the voice holds without example
// dialogue having to carry it all. Only what's set is mentioned.

export const LENGTH_LABELS: Record<NonNullable<WritingStyle["length"]>, string> = {
  short: "Short (a line or two)",
  medium: "Medium",
  long: "Long and expressive",
};
export const PUNCTUATION_LABELS: Record<NonNullable<WritingStyle["punctuation"]>, string> = {
  sparse: "Little punctuation",
  normal: "Normal",
  careful: "Careful, full sentences",
};
export const EMOJI_LABELS: Record<NonNullable<WritingStyle["emoji"]>, string> = {
  none: "Never",
  rare: "Now and then",
  often: "Often",
};

const LENGTH_HOW: Record<NonNullable<WritingStyle["length"]>, string> = {
  short: "keeps messages short, a line or two",
  medium: "writes a few sentences at a time",
  long: "writes long, expressive messages",
};
const PUNCTUATION_HOW: Record<NonNullable<WritingStyle["punctuation"]>, string> = {
  sparse: "uses little punctuation, often no full stops",
  normal: "punctuates normally",
  careful: "punctuates carefully, in full sentences",
};
const EMOJI_HOW: Record<NonNullable<WritingStyle["emoji"]>, string> = {
  none: "never uses emoji",
  rare: "uses an emoji now and then",
  often: "uses emoji often",
};

// Drops a profile with nothing set, so a character without one stays as is.
export const cleanWritingStyle = (style: WritingStyle | undefined): WritingStyle | undefined => {
  if (!style) return undefined;
  const cleaned: WritingStyle = {};
  if (style.length) cleaned.length = style.length;
  if (style.lowercase) cleaned.lowercase = true;
  if (style.punctuation) cleaned.punctuation = style.punctuation;
  if (style.emoji) cleaned.emoji = style.emoji;
  if (style.abbreviations) cleaned.abbreviations = true;
  if (style.doubleTexts) cleaned.doubleTexts = true;
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
};

const traits = (style: WritingStyle): string[] => [
  ...(style.length ? [LENGTH_HOW[style.length]] : []),
  ...(style.lowercase ? ["writes mostly in lowercase"] : []),
  ...(style.punctuation ? [PUNCTUATION_HOW[style.punctuation]] : []),
  ...(style.emoji ? [EMOJI_HOW[style.emoji]] : []),
  ...(style.abbreviations ? ["uses abbreviations (u, rn, tbh, idk)"] : []),
  ...(style.doubleTexts ? ["often sends a thought as two or three texts in a row rather than one"] : []),
];

export const buildWritingStyleSection = (name: string, style: WritingStyle | undefined): string | undefined => {
  const list = style ? traits(style) : [];
  return list.length > 0 ? `How ${name} writes: ${list.join("; ")}. Keep to this in every reply, whatever the mood.` : undefined;
};

// The one-liner for first texts (#93): same traits, no framing.
export const writingStyleLine = (style: WritingStyle | undefined): string | undefined => {
  const list = style ? traits(style) : [];
  return list.length > 0 ? list.join("; ") : undefined;
};
