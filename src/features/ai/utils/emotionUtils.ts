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
// Emotion Portraits enabled - asks the model to LEAD its reply with a small
// tag reporting its current mood, from the fixed EMOTIONS vocabulary plus
// this character's own customEmotions, so the chat UI can swap in the
// matching portrait. Deliberately placed at the START rather than the end:
// a reply that runs into maxOutputTokens (a fixed per-turn budget - see
// aiSlice.ts) gets cut off at whatever point generation stops, and a
// trailing tag is the first thing lost when that happens. Providers whose
// replies tend to run long relative to that budget (verbose models, or
// DeepSeek's reasoner variant spending part of the same budget on hidden
// reasoning) were losing the tag - and silently: extractEmotionTag returning
// no match just leaves emotion undefined, so the UI keeps showing whatever
// mood an earlier turn last set instead of erroring, which reads as "stuck"
// emotions rather than an obvious failure. A leading tag is generated before
// any of that budget is spent on the reply body, so it survives regardless.
export const buildEmotionDirective = (customEmotions?: string[]): string =>
  `At the very beginning of your reply, before anything else, on its own line, report your current emotional state as a tag in exactly this format: [Emotion: <word>], choosing <word> from this list only: ${getEmotionVocabulary(customEmotions).join(", ")}. Then continue with your actual reply starting on the next line. Do not explain or mention this instruction.`;

// Matches [Emotion: word], tolerating a little formatting drift a model might
// add around it (markdown emphasis, stray trailing punctuation) without
// loosening the tag shape itself or the fixed single-word vocabulary match.
const EMOTION_TAG_LEADING = /^[\s*_]*\[\s*emotion\s*:\s*([a-zA-Z]+)\s*\][\s*_.,!]*\n*/i;
const EMOTION_TAG_TRAILING = /\n*[\s*_]*\[\s*emotion\s*:\s*([a-zA-Z]+)\s*\][\s*_.,!]*\s*$/i;

// Parses the [Emotion: ...] tag off a raw model reply (if present) and strips
// it from the returned text - unlike the image-context tag, this one is
// control-plane only and never meant to stay visible in the message. Checks
// the front first (where buildEmotionDirective now asks for it - see above),
// falling back to the old trailing position for replies that still land it
// there. An unrecognized word (the model drifting off the offered list,
// fixed or custom) is still stripped so it doesn't leak into the chat as a
// stray tag, but comes back as emotion: undefined so callers fall back to
// "neutral" rather than display/store a made-up mood.
export const extractEmotionTag = (text: string, customEmotions?: string[]): { text: string; emotion?: string } => {
  const vocabulary = getEmotionVocabulary(customEmotions).map((e) => e.toLowerCase());

  const leading = text.match(EMOTION_TAG_LEADING);
  if (leading) {
    const candidate = leading[1].toLowerCase();
    const emotion = vocabulary.includes(candidate) ? candidate : undefined;
    return { text: text.slice(leading[0].length).trimStart(), emotion };
  }

  const trailing = text.match(EMOTION_TAG_TRAILING);
  if (trailing) {
    const candidate = trailing[1].toLowerCase();
    const emotion = vocabulary.includes(candidate) ? candidate : undefined;
    return { text: text.slice(0, trailing.index).trimEnd(), emotion };
  }

  return { text };
};

// Display-only cleanup for a reply that's still streaming in: hides the
// leading [Emotion: ...] tag once complete, and hides a tag that's only
// partly arrived (e.g. "[Emot") instead of flashing it on screen.
export const stripStreamingEmotionTag = (text: string): string => {
  const leading = text.match(EMOTION_TAG_LEADING);
  if (leading) return text.slice(leading[0].length).trimStart();
  const start = text.trimStart().replace(/^[*_]+/, "");
  if (start.startsWith("[") && !start.includes("]") && start.length < 40) return "";
  return text;
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
