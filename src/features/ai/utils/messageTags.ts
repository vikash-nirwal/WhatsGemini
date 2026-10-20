import { stripStreamingEmotionTag } from "./emotionUtils";
import { stripStreamingBeatTag } from "../../chat/storyScript";
import { stripStreamingGameTag } from "../../chat/miniGames";

// Control tags a character's reply can carry besides [Emotion: ...]: hidden
// inner thoughts (#10) and an emoji reaction to the user's message (#11).
// Like the emotion tag they're parsed off the reply and stored on the
// message separately, so they never show as text or go back to the model as
// something the character said aloud.

// ---- Inner thoughts (#10) ----

// At the end, since it comments on what was just said. If a long reply runs
// out of tokens the thought is what's lost, which is the cheapest part.
export const buildThoughtsDirective = (): string =>
  `After your reply, on a new last line, add your private inner thoughts in exactly this format: <thoughts>...</thoughts>. One or two short sentences in first person: what you really think or feel right now but aren't saying out loud. The user can't hear them, so they can differ from your words. Never mention or react to these thoughts in your spoken reply.`;

const THOUGHTS_BLOCK = /<\s*thoughts\s*>([\s\S]*?)<\s*\/\s*thoughts\s*>/gi;
// An opening tag with no closing one, running to the end (a cut-off reply).
const THOUGHTS_UNCLOSED = /<\s*thoughts\s*>([\s\S]*)$/i;

export const extractThoughts = (text: string): { text: string; thoughts?: string } => {
  const found: string[] = [];
  let rest = text.replace(THOUGHTS_BLOCK, (_, inner: string) => {
    if (inner.trim()) found.push(inner.trim());
    return "";
  });
  const unclosed = rest.match(THOUGHTS_UNCLOSED);
  if (unclosed) {
    if (unclosed[1].trim()) found.push(unclosed[1].trim());
    rest = rest.slice(0, unclosed.index);
  }
  if (found.length === 0 && rest === text) return { text };
  return { text: rest.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), thoughts: found.length > 0 ? found.join(" ") : undefined };
};

// ---- Reactions (#11) ----

export const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

export const buildReactionDirective = (): string =>
  `Now and then, when it feels natural (not every time), you can react to the user's last message with an emoji, like a messaging app reaction: put [React: <emoji>] at the very start of your reply, using one of ${REACTION_EMOJIS.join(" ")}. Then write your reply as usual. Never explain the tag.`;

const REACTION_TAG_LEADING = /^[\s*_]*\[\s*react(?:ion|ed)?\s*:\s*([^\]\n]{1,16}?)\s*\][\s*_.,!]*\n*/i;

// Accepts only the offered emojis (the variation selector on ❤️ is optional
// in what models write); anything else is stripped but not kept.
const normalizeReaction = (raw: string): string | undefined => {
  const bare = raw.replace(/️/g, "").trim();
  return REACTION_EMOJIS.find((e) => e.replace(/️/g, "") === bare);
};

export const extractReactionTag = (text: string): { text: string; reaction?: string } => {
  const leading = text.match(REACTION_TAG_LEADING);
  if (!leading) return { text };
  return { text: text.slice(leading[0].length).trimStart(), reaction: normalizeReaction(leading[1]) };
};

// What the model is told about the user's reaction, shown before the user's
// next message in the history.
export const formatReactionNote = (emoji: string, reactedText: string, who = "The user"): string => {
  const snippet = reactedText.replace(/\s+/g, " ").trim();
  const short = snippet.length > 80 ? `${snippet.slice(0, 77).trimEnd()}...` : snippet;
  return `[${who} reacted ${emoji} to: "${short}"]`;
};

// ---- While streaming ----

// Display-only: hides the control tags of a reply that's still arriving,
// including a tag that's only partly there (e.g. "[Rea" or "<thou"), in
// whatever order the leading tags come.
export const stripStreamingTags = (text: string): string => {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const before = out;
    const reaction = out.match(REACTION_TAG_LEADING);
    if (reaction) out = out.slice(reaction[0].length).trimStart();
    out = stripStreamingEmotionTag(out);
    if (out === before) break;
  }
  out = out.replace(THOUGHTS_BLOCK, "");
  const unclosed = out.match(THOUGHTS_UNCLOSED);
  if (unclosed) out = out.slice(0, unclosed.index);
  // A tag still being typed at the very end, including a story beat tag (#57).
  return stripStreamingGameTag(stripStreamingBeatTag(out.replace(/<\s*t?h?o?u?g?h?t?s?\s*$/i, "").trimEnd()));
};
