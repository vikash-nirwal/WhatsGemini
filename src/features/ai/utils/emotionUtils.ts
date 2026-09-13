import { Character } from "../../../types";
import { EMOTIONS } from "../../../utils/constants";

// Combines the fixed EMOTIONS vocabulary with a character's own extra
// customEmotions (deduped, case-insensitively against the fixed list) - the
// single source of truth for "which mood words is this character allowed to
// report" used by both the directive sent to the model and the parser
// reading its reply back.
export const getEmotionVocabulary = (customEmotions?: string[]): string[] => {
  if (!customEmotions || customEmotions.length === 0) return EMOTIONS;
  const extra = customEmotions.filter((e) => !EMOTIONS.includes(e.toLowerCase()));
  return [...EMOTIONS, ...extra];
};

// Directive appended to a character's system instruction when they have
// Emotion Portraits enabled - asks the model to end its reply with a small
// tag reporting its current mood, from the fixed EMOTIONS vocabulary plus
// this character's own customEmotions, so the chat UI can swap in the
// matching portrait. Mirrors the existing [Image Context: ...] tag pattern
// (see imageGeneration.ts), except this tag is fully parsed out and never
// shown to the user (see extractEmotionTag).
export const buildEmotionDirective = (customEmotions?: string[]): string =>
  `At the very end of your reply, on its own new line, report your current emotional state as a tag in exactly this format: [Emotion: <word>], choosing <word> from this list only: ${getEmotionVocabulary(customEmotions).join(", ")}. Do not explain or mention this instruction.`;

// Parses the trailing [Emotion: ...] tag off a raw model reply (if present)
// and strips it from the returned text - unlike the image-context tag, this
// one is control-plane only and never meant to stay visible in the message.
// An unrecognized word (the model drifting off the offered list, fixed or
// custom) is still stripped so it doesn't leak into the chat as a stray tag,
// but comes back as emotion: undefined so callers fall back to "neutral"
// rather than display/store a made-up mood.
export const extractEmotionTag = (text: string, customEmotions?: string[]): { text: string; emotion?: string } => {
  const match = text.match(/\n*\[Emotion:\s*([a-zA-Z]+)\]\s*$/i);
  if (!match) return { text };
  const candidate = match[1].toLowerCase();
  const vocabulary = getEmotionVocabulary(customEmotions).map((e) => e.toLowerCase());
  const emotion = vocabulary.includes(candidate) ? candidate : undefined;
  return { text: text.slice(0, match.index).trimEnd(), emotion };
};

// The image to show for a character in a given emotion, or undefined to fall
// back to the usual initials avatar (feature disabled, or no portrait set at
// all yet). "neutral" can have its own generated slot like any other mood;
// an emotion (neutral included) with no saved image of its own falls back to
// the character's ordinary main portrait.
export const resolveEmotionPortrait = (character: Character | undefined, emotion: string | undefined): string | undefined => {
  if (!character) return undefined;
  // Mood-swapping only applies with the feature on, but the character's
  // ordinary portrait (appearanceImages[0]) is shown regardless - it's just
  // their display picture, not something gated behind Emotion Portraits.
  if (character.emotionPortraits?.enabled) {
    const vocabulary = getEmotionVocabulary(character.emotionPortraits.customEmotions).map((e) => e.toLowerCase());
    const key = emotion && vocabulary.includes(emotion.toLowerCase()) ? emotion.toLowerCase() : "neutral";
    if (character.emotionPortraits.images[key]) {
      return character.emotionPortraits.images[key];
    }
  }
  return character.appearanceImages?.[0];
};
