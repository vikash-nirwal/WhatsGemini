import { Character } from "../../../types";
import { EMOTIONS } from "../../../utils/constants";

// Directive appended to a character's system instruction when they have
// Emotion Portraits enabled - asks the model to end its reply with a small
// tag reporting its current mood, from the fixed EMOTIONS vocabulary, so
// the chat UI can swap in the matching portrait. Mirrors the existing
// [Image Context: ...] tag pattern (see imageGeneration.ts), except this tag
// is fully parsed out and never shown to the user (see extractEmotionTag).
export const buildEmotionDirective = (): string =>
  `At the very end of your reply, on its own new line, report your current emotional state as a tag in exactly this format: [Emotion: <word>], choosing <word> from this list only: ${EMOTIONS.join(", ")}. Do not explain or mention this instruction.`;

// Parses the trailing [Emotion: ...] tag off a raw model reply (if present)
// and strips it from the returned text - unlike the image-context tag, this
// one is control-plane only and never meant to stay visible in the message.
// An unrecognized word (the model drifting off the fixed list) is still
// stripped so it doesn't leak into the chat as a stray tag, but comes back
// as emotion: undefined so callers fall back to "neutral" rather than
// display/store a made-up mood.
export const extractEmotionTag = (text: string): { text: string; emotion?: string } => {
  const match = text.match(/\n*\[Emotion:\s*([a-zA-Z]+)\]\s*$/i);
  if (!match) return { text };
  const candidate = match[1].toLowerCase();
  const emotion = EMOTIONS.includes(candidate) ? candidate : undefined;
  return { text: text.slice(0, match.index).trimEnd(), emotion };
};

// The image to show for a character in a given emotion, or undefined to fall
// back to the usual initials avatar (feature disabled, or no portrait set at
// all yet). "neutral" can have its own generated slot like any other mood;
// an emotion (neutral included) with no saved image of its own falls back to
// the character's ordinary main portrait.
export const resolveEmotionPortrait = (character: Character | undefined, emotion: string | undefined): string | undefined => {
  if (!character?.emotionPortraits?.enabled) return undefined;
  const key = emotion && EMOTIONS.includes(emotion) ? emotion : "neutral";
  if (character.emotionPortraits.images[key]) {
    return character.emotionPortraits.images[key];
  }
  return character.appearanceImages?.[0];
};
