import { Character } from "../../types";

// Numbers under the story (#211). Ties were only words ("your friend"),
// so nothing measured how two people were doing, and every choice - who
// talks, whose life turns, which tie is about to change - was either random
// or another model call. Now each character keeps, for each person they
// know, how close they feel (-100 to 100) and how much tension there is
// (0 to 100), and a mood of their own (-100 to 100). Talks, tie changes,
// secrets, life events and goals nudge them, with no model call; they fade
// back with time. The numbers are always kept; they only change what
// happens in worlds with drift on (featureOn "drift"), like ties drifting.

export interface Bond {
  withId: number;
  closeness: number; // -100 (can't stand them) .. 100 (couldn't be closer)
  tension: number; // 0 (easy) .. 100 (about to break)
  at: number; // when it was last nudged
  why?: { text: string; at: number }[]; // what moved it lately, newest last (#217)
}

export interface Mood {
  value: number; // -100 (as low as it gets) .. 100 (on top of the world)
  at: number;
  why?: string; // what moved it last (#217)
}

const DAY = 24 * 60 * 60 * 1000;
const TENSION_HALF_LIFE = 3 * DAY;
const CLOSENESS_HALF_LIFE = 14 * DAY;
const MOOD_HALF_LIFE = 2 * DAY;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
const fade = (value: number, toward: number, ms: number, halfLife: number) => toward + (value - toward) * Math.pow(0.5, Math.max(0, ms) / halfLife);

// Where closeness rests for a tie, by its words. No tie, or one these
// don't know, rests at a friendly acquaintance's 10.
const BASELINES: [RegExp, number][] = [
  [/\b(enemy|nemesis|hates?)\b/i, -60],
  [/\b(rival|ex|estranged)\b/i, -25],
  [/\b(boss|colleague|coworker|co-worker|neighbou?r|classmate|acquaintance)\b/i, 15],
  [/\b(friend|mentor|student|roommate|cousin)\b/i, 40],
  [/\b(sister|brother|sibling|mother|father|mum|mom|dad|parent|son|daughter|best friend)\b/i, 55],
  [/\b(partner|wife|husband|girlfriend|boyfriend|fianc[eé]e?|lover|spouse)\b/i, 70],
];

export const tieBaseline = (tie: string | undefined): number => {
  if (!tie) return 10;
  // The strongest word wins: "best friend" over "friend", "ex-girlfriend"
  // as an ex.
  if (/\bex[-\s]/i.test(tie)) return -25;
  let best: number | undefined;
  for (const [re, n] of BASELINES) if (re.test(tie)) best = best === undefined || Math.abs(n) > Math.abs(best) ? n : best;
  return best ?? 10;
};

const tieWith = (c: Pick<Character, "ties">, otherId: number) => c.ties?.find((t) => t.withId === otherId)?.tie;

// How `c` stands with `otherId` now, faded since it was last nudged.
export const bondOf = (c: Pick<Character, "bonds" | "ties">, otherId: number, now: number): Bond => {
  const base = tieBaseline(tieWith(c, otherId));
  const b = c.bonds?.find((x) => x.withId === otherId);
  if (!b) return { withId: otherId, closeness: base, tension: 0, at: now };
  return { withId: otherId, closeness: fade(b.closeness, base, now - b.at, CLOSENESS_HALF_LIFE), tension: fade(b.tension, 0, now - b.at, TENSION_HALF_LIFE), at: now, ...(b.why ? { why: b.why } : {}) };
};

export const moodOf = (c: Pick<Character, "mood">, now: number): number => (c.mood ? fade(c.mood.value, 0, now - c.mood.at, MOOD_HALF_LIFE) : 0);

// The fields a nudge changes, for patchCharacter.
// `why` (#217): what moved it, in a few words, kept with the last few.
export const nudgeBond = (c: Pick<Character, "bonds" | "ties">, otherId: number, { closeness = 0, tension = 0 }: { closeness?: number; tension?: number }, now: number, why?: string): Pick<Character, "bonds"> => {
  const b = bondOf(c, otherId, now);
  const reasons = why ? [...(b.why || []), { text: why.slice(0, 160), at: now }].slice(-KEEP_WHY) : b.why;
  const next: Bond = { withId: otherId, closeness: clamp(b.closeness + closeness, -100, 100), tension: clamp(b.tension + tension, 0, 100), at: now, ...(reasons ? { why: reasons } : {}) };
  return { bonds: [...(c.bonds || []).filter((x) => x.withId !== otherId), next] };
};

export const nudgeMood = (c: Pick<Character, "mood">, delta: number, now: number, why?: string): Pick<Character, "mood"> => {
  const why2 = why && delta ? why.slice(0, 160) : c.mood?.why;
  return { mood: { value: clamp(moodOf(c, now) + delta, -100, 100), at: now, ...(why2 ? { why: why2 } : {}) } };
};

// Reasons (#217): the latest cause that's still recent, so a prompt can
// say why two people are tense, not only that they are. Older causes have
// faded with the numbers they moved.
const KEEP_WHY = 3;
const WHY_FOR = 14 * DAY;
export const reasonOf = (c: Pick<Character, "bonds" | "ties">, otherId: number, now: number): string | undefined => {
  const why = c.bonds?.find((b) => b.withId === otherId)?.why;
  const last = why?.[why.length - 1];
  return last && now - last.at < WHY_FOR ? last.text : undefined;
};
export const moodReasonOf = (c: Pick<Character, "mood">, now: number): string | undefined => (c.mood?.why && now - c.mood.at < WHY_FOR ? c.mood.why : undefined);

// What moves them. A talk brings two people a little closer and eases
// things; a tie that changes moves closeness towards the new tie's resting
// place, and a change for the worse leaves tension behind it.
export const TALKED = { closeness: 3, tension: -4 };
export const BECAME_FRIENDS = { closeness: 10 };
export const tieShift = (before: string | undefined, after: string) => {
  const from = tieBaseline(before);
  const to = tieBaseline(after);
  return { closeness: (to - from) / 2, tension: to < from ? 25 : -10 };
};

// A life event's rough tone, from its words: good news lifts their mood,
// bad news sinks it. Most are neither.
const GOOD = /\b(won|wins|promot|engaged|married|got the job|new job|passed|celebrat|reunit|recovered|baby|born|birthday|award|raise|fell in love|moved in)\w*/i;
const BAD = /\b(lost|loses|fired|quit|broke up|break-?up|divorc|died|death|funeral|ill|sick|hospital|injur|accident|fail|robbed|evict|argu|fight|fought)\w*/i;
export const lifeEventTone = (text: string): number => (BAD.test(text) ? -25 : GOOD.test(text) ? 25 : 0);

type Person = Pick<Character, "id" | "bonds" | "ties">;

// How charged things are between two people (0..100), from the first's
// side: very close, very hostile, or tense.
export const intensity = (a: Person, b: Pick<Character, "id">, now: number) => {
  const bond = bondOf(a, b.id, now);
  return Math.max(Math.abs(bond.closeness), bond.tension);
};

// Charged pairs talk more often: their gap shrinks by up to half.
export const talkGapFor = (gapMs: number, a: Person, b: Person, now: number) => gapMs * (1 - Math.max(intensity(a, b, now), intensity(b, a, now)) / 200);

// A tie that's under strain - very tense, or far from where the tie
// says it should rest - is one a talk may change.
export const tieUnderStrain = (a: Pick<Character, "bonds" | "ties">, otherId: number, now: number) => {
  const bond = bondOf(a, otherId, now);
  return bond.tension >= 60 || Math.abs(bond.closeness - tieBaseline(tieWith(a, otherId))) >= 40;
};

// For a talk's prompt: how the two stand lately and how each is doing, in
// words, only when something stands out.
export const standingLine = (a: Pick<Character, "id" | "name" | "bonds" | "ties" | "mood">, b: Pick<Character, "id" | "name" | "bonds" | "ties" | "mood">, now: number): string | undefined => {
  const ab = bondOf(a, b.id, now);
  const ba = bondOf(b, a.id, now);
  const tension = Math.max(ab.tension, ba.tension);
  const drift = (ab.closeness - tieBaseline(tieWith(a, b.id)) + ba.closeness - tieBaseline(tieWith(b, a.id))) / 2;
  const parts: string[] = [];
  // Why (#217), once, on the first thing it explains.
  let why = reasonOf(a, b.id, now) || reasonOf(b, a.id, now);
  const because = () => {
    const text = why ? ` (${why})` : "";
    why = undefined;
    return text;
  };
  if (tension >= 70) parts.push(`things between ${a.name} and ${b.name} are close to breaking${because()}`);
  else if (tension >= 40) parts.push(`things between ${a.name} and ${b.name} have been tense lately${because()}`);
  if (drift >= 25) parts.push(`they've grown closer than they used to be${because()}`);
  else if (drift <= -25) parts.push(`they've drifted apart${because()}`);
  for (const c of [a, b]) {
    const m = moodOf(c, now);
    const moodWhy = moodReasonOf(c, now);
    if (m <= -30) parts.push(`${c.name} has been low lately${moodWhy ? ` (${moodWhy})` : ""}`);
    else if (m >= 30) parts.push(`${c.name} is in high spirits${moodWhy ? ` (${moodWhy})` : ""}`);
  }
  return parts.length ? `How they are lately: ${parts.join("; ")}. Let it show without saying it outright.` : undefined;
};

// Picks with weights instead of evenly: whose life turns next leans to
// whoever's mood is furthest from even, and which secret gets kept leans
// to pairs that are close or tense (the ones with something to hide).
export const weightedPick = <T,>(items: T[], weight: (item: T) => number, rand: () => number = Math.random): T | undefined => {
  const weights = items.map((i) => Math.max(0.01, weight(i)));
  let r = rand() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < items.length; i++) if ((r -= weights[i]) <= 0) return items[i];
  return items[items.length - 1];
};

export const lifeWeight = (c: Pick<Character, "mood">, now: number) => 1 + Math.abs(moodOf(c, now)) / 25;
export const secretWeight = (keeper: Pick<Character, "bonds" | "ties">, from: Pick<Character, "id">, now: number) => {
  const bond = bondOf(keeper, from.id, now);
  return 1 + Math.max(0, bond.closeness) / 50 + bond.tension / 50;
};

// For the relationship map: a word or two for how one feels about the
// other, when it stands out.
export const bondWords = (c: Pick<Character, "bonds" | "ties">, otherId: number, now: number): string | undefined => {
  const bond = bondOf(c, otherId, now);
  const words: string[] = [];
  if (bond.closeness >= 60) words.push("very close");
  else if (bond.closeness >= 30) words.push("close");
  else if (bond.closeness <= -40) words.push("hostile");
  else if (bond.closeness <= -10) words.push("cool");
  if (bond.tension >= 60) words.push("very tense");
  else if (bond.tension >= 30) words.push("tense");
  return words.length ? words.join(", ") : undefined;
};
