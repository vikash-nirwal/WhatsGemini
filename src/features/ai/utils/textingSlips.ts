// Texting imperfections (#108): in texting mode, a character with slips on
// sometimes makes a typo and sends a one-word correction, deletes a message
// and sends it again, starts typing and stops before the texts arrive, and
// quotes one of your messages when you sent several at once. Display only,
// like texting mode itself: the stored message stays clean, and every slip
// is decided from the message's id, so a reply looks the same every time
// it's shown. The "busy" side of it (a bare "?" or "lol" when they're in the
// middle of something) is a prompt note, see buildSlipsDirective.

export type SlipLevel = 0 | 1 | 2; // none, a few, plenty

export interface TextBubble {
  text: string;
  kind: "text" | "deleted" | "correction";
  quote?: string; // one of your messages this bubble answers
}

export interface SlipPlan {
  bubbles: TextBubble[];
  falseStart: boolean; // typing starts, stops, then starts again before the first bubble
}

export const DELETED_TEXT = "This message was deleted";

// How often each slip happens, by level.
const RATES: Record<Exclude<SlipLevel, 0>, { typo: number; deleted: number; falseStart: number; quote: number }> = {
  1: { typo: 0.15, deleted: 0.08, falseStart: 0.2, quote: 0.6 },
  2: { typo: 0.35, deleted: 0.18, falseStart: 0.4, quote: 0.85 },
};

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// A small seeded generator (mulberry32), so one id gives one plan.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// A plain word of five letters or more, somewhere a swapped pair reads as a
// slip of the thumb rather than a different word.
const TYPO_WORD = /\b[a-z]{5,}\b/g;

const swapLetters = (word: string, at: number): string => word.slice(0, at) + word[at + 1] + word[at] + word.slice(at + 2);

const words = (text: string): Set<string> => new Set(text.toLowerCase().match(/[a-z']{3,}/g) || []);

// Which of a burst of your messages a reply most likely answers: the one
// sharing the most words with it, the first when nothing matches. No quote
// when it's the last one, since that's what a reply answers by default.
const quoteFor = (reply: string, burst: string[]): string | undefined => {
  const replyWords = words(reply);
  let best = -1;
  let bestScore = 0;
  burst.forEach((text, i) => {
    let score = 0;
    words(text).forEach((w) => {
      if (replyWords.has(w)) score++;
    });
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  const index = best === -1 ? 0 : best;
  if (index === burst.length - 1) return undefined;
  const quoted = burst[index].replace(/\s+/g, " ").trim();
  return quoted.length > 80 ? `${quoted.slice(0, 77).trimEnd()}...` : quoted;
};

export const planSlips = (parts: string[], seed: string, level: SlipLevel | undefined, userBurst?: string[]): SlipPlan => {
  const bubbles: TextBubble[] = parts.map((text) => ({ text, kind: "text" }));
  if (!level || parts.length === 0) return { bubbles, falseStart: false };
  const rates = RATES[level];
  const random = rng(hash(seed));
  // The rolls come first, in a fixed order, so adding a slip later doesn't
  // reshuffle the others.
  const rollTypo = random() < rates.typo;
  const rollDeleted = random() < rates.deleted;
  const falseStart = random() < rates.falseStart;
  const rollQuote = random() < rates.quote;
  const pick = (n: number) => Math.min(n - 1, Math.floor(random() * n));

  if (rollTypo) {
    const candidates = bubbles.map((b, i) => ({ i, matches: b.text.match(TYPO_WORD) || [] })).filter((c) => c.matches.length > 0);
    if (candidates.length > 0) {
      const target = candidates[pick(candidates.length)];
      const word = target.matches[pick(target.matches.length)];
      const at = 1 + pick(word.length - 3); // never the first or last letter
      const bubble = bubbles[target.i];
      bubble.text = bubble.text.replace(new RegExp(`\\b${word}\\b`), swapLetters(word, at));
      bubbles.splice(target.i + 1, 0, { text: `*${word}`, kind: "correction" });
    }
  }
  if (rollDeleted) {
    const at = pick(bubbles.length);
    bubbles.splice(at, 0, { text: DELETED_TEXT, kind: "deleted" });
  }
  if (rollQuote && userBurst && userBurst.length >= 2) {
    const first = bubbles.find((b) => b.kind === "text");
    const quote = first ? quoteFor(first.text, userBurst) : undefined;
    if (first && quote) first.quote = quote;
  }
  return { bubbles, falseStart };
};

// How long "typing..." shows before each kind of bubble: a deleted message
// comes and goes quickly, a correction is a reflex.
export const bubbleDelayMs = (bubble: TextBubble, textDelay: (text: string) => number): number =>
  bubble.kind === "deleted" ? 900 : bubble.kind === "correction" ? 600 : textDelay(bubble.text);

// Typing that starts, stops, and starts again: how long each phase lasts.
export const FALSE_START_MS = { typing: 1100, paused: 1400 };

// The prompt's side: when they're busy a reply can be a word or two, and at
// the higher level they text fast and loose. Only in texting mode.
export const buildSlipsDirective = (name: string, level: SlipLevel | undefined, busy: boolean): string | undefined => {
  if (!level) return undefined;
  const lines = [
    ...(busy ? [`${name} is in the middle of something right now: it's fine for a reply to be just a word or two, a bare "?" or "lol", or to answer only part of what was said and come back to the rest later.`] : []),
    ...(level === 2 ? [`${name} texts fast and loose: lowercase, little punctuation, the odd abbreviation, sometimes a thought split over two texts.`] : []),
  ];
  return lines.length > 0 ? lines.join(" ") : undefined;
};
