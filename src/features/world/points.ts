// Points (#234): with the world's "Points" switch on, every character keeps
// a score from 0 to 10 for each of the world's traits (affection, trust,
// respect, attraction, rivalry, or the world's own), toward you and toward
// each person they know. Replies are told the scores and may move them
// with a [Points: ...] tag; world life moves them through the bonds (#211)
// they extend; they fade back to where they started; and you can set them
// by hand on the character's Contact info.
//
// This file is the storage and arithmetic, with no knowledge of ties or
// worlds, so bonds.ts can use it without a circular import; pointsNotes.ts
// has what needs both.

export const DEFAULT_TRAITS = ["affection", "trust", "respect", "attraction", "rivalry"];
export const MAX_TRAITS = 8;
export const MAX_STEP = 2; // the most one reply or event moves a trait
const DAY = 24 * 60 * 60 * 1000;
const HALF_LIFE = 21 * DAY;
const KEEP_WHY = 3;

export interface Points {
  values: Record<string, number>; // trait -> 0..10, as of `at`
  at: number;
  why?: { text: string; at: number }[]; // what moved them lately, newest last
}

export const cleanTrait = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 24);

// The traits a world keeps: its own list (deduped, a few at most), or the defaults.
export const traitsFrom = (own: string[] | undefined): string[] => {
  const list = Array.from(new Set((own || []).map(cleanTrait).filter(Boolean))).slice(0, MAX_TRAITS);
  return list.length ? list : DEFAULT_TRAITS;
};

const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));

// Where a trait rests, from how close the tie is (bonds' closeness baseline,
// -60 for an enemy to 70 for a partner; 10 with no tie). Traits the app
// doesn't know rest in the middle.
export const startFor = (trait: string, base: number): number => {
  switch (trait) {
    case "affection":
      return clamp(5 + base / 20);
    case "trust":
      return clamp(5 + base / 25);
    case "respect":
      return clamp(5 + base / 40);
    case "attraction":
      return clamp(base >= 60 ? 7 : 2);
    case "rivalry":
      return clamp(base < 0 ? 1 - base / 12 : 1);
    default:
      return 5;
  }
};

// The scores now, each faded back toward where it rests.
export const valuesOf = (p: Points | undefined, traits: string[], base: number, now: number): Record<string, number> =>
  Object.fromEntries(traits.map((t) => {
    const rest = startFor(t, base);
    const v = p?.values[t];
    if (v === undefined || !p) return [t, rest];
    return [t, clamp(rest + (v - rest) * Math.pow(0.5, Math.max(0, now - p.at) / HALF_LIFE))];
  }));

// Moved by `deltas` (each kept within MAX_STEP), from the faded scores.
// Traits the world doesn't keep are ignored.
export const movePoints = (p: Points | undefined, traits: string[], base: number, deltas: Record<string, number>, now: number, why?: string): Points | undefined => {
  const known = Object.entries(deltas).filter(([t, d]) => traits.includes(t) && Number.isFinite(d) && d !== 0);
  if (!known.length) return p;
  const values = valuesOf(p, traits, base, now);
  for (const [t, d] of known) values[t] = clamp(values[t] + Math.max(-MAX_STEP, Math.min(MAX_STEP, d)));
  const reasons = why ? [...(p?.why || []), { text: why.slice(0, 160), at: now }].slice(-KEEP_WHY) : p?.why;
  return { values, at: now, ...(reasons ? { why: reasons } : {}) };
};

// Set by hand: exactly the value given, no step limit.
export const setPoint = (p: Points | undefined, traits: string[], base: number, trait: string, value: number, now: number): Points => {
  const values = valuesOf(p, traits, base, now);
  values[trait] = clamp(value);
  return { values, at: now, ...(p?.why ? { why: p.why } : {}) };
};

// World life through the bonds (#211): what nudges closeness and tension
// nudges the matching traits, at a tenth of the scale.
export const deltasFromBond = (closeness: number, tension: number): Record<string, number> => ({
  ...(closeness ? { affection: closeness / 10 } : {}),
  ...(tension ? { rivalry: tension / 10, trust: -tension / 20 } : {}),
});

// A level in words, for the prompt beside the number.
export const levelWord = (v: number) => (v >= 9 ? "very high" : v >= 7 ? "high" : v >= 4 ? "middling" : v >= 2 ? "low" : "very low");

// The reply tag (#234): "[Points: trust +1, affection -0.5]" is toward the
// user; "[Points Kai: rivalry +1]" toward someone else in the chat.
const TAG = /\n?[ \t]*\[\s*points(?:\s+([^:\]\n]+?))?\s*:\s*([^\]\n]*)\]\s*/gi;
export interface PointsChange {
  toward?: string; // a name; unset = the user
  deltas: Record<string, number>;
}

export const extractPointsTags = (text: string): { text: string; changes: PointsChange[] } => {
  const changes: PointsChange[] = [];
  const out = text.replace(TAG, (_m, who: string | undefined, body: string) => {
    const deltas: Record<string, number> = {};
    for (const part of body.split(/[,;]/)) {
      const m = part.trim().match(/^([a-z][a-z ]*?)\s*([+-]\s*\d+(?:\.\d+)?)$/i);
      if (m) deltas[cleanTrait(m[1])] = Number(m[2].replace(/\s+/g, ""));
    }
    if (Object.keys(deltas).length) changes.push({ ...(who?.trim() ? { toward: who.trim() } : {}), deltas });
    return "\n";
  });
  return { text: out === text ? text : out.replace(/\n{3,}/g, "\n\n").trim(), changes };
};

// While streaming: whole tags, and one still being typed at the very end.
export const stripStreamingPoints = (text: string) =>
  text.replace(TAG, "\n").replace(/\[\s*p(o(i(n(t(s[^\]]*)?)?)?)?)?$/i, "").trimEnd();
