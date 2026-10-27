import { weightedPick } from "./bonds";
import { Character, World } from "../../types";

// Arrivals, departures and life events (#164): over story time things
// happen to the people in a world - a new job, a move, an engagement, a
// loss, leaving town for a while - and now and then someone new turns up,
// tied to someone already there, for you to welcome or turn away.

const DAY = 24 * 60 * 60 * 1000;
const KEEP = 8;
export const LIFE_GAP_MS = DAY;
export const NEWCOMER_GAP_MS = 5 * DAY;
const NOTE_FOR_MS = 21 * DAY;

export const lifeEventDue = (world: Pick<World, "lastLifeAt">, now: number, gapMs: number = LIFE_GAP_MS, rand: () => number = Math.random) =>
  now - (world.lastLifeAt || 0) >= gapMs && rand() < 0.6;

export const newcomerDue = (world: Pick<World, "lastNewcomerAt" | "newcomer">, castSize: number, now: number, gapMs: number = NEWCOMER_GAP_MS, rand: () => number = Math.random) =>
  !world.newcomer && castSize >= 2 && now - (world.lastNewcomerAt || 0) >= gapMs && rand() < 0.5;

// Whose life moves on: anyone, but less often someone it just happened to.
export const pickLifeSubject = (cast: Character[], now: number, rand: () => number = Math.random, weight?: (c: Character) => number): Character | undefined => {
  const pool = cast.filter((c) => !(c.lifeEvents || []).some((e) => now - e.at < 7 * DAY));
  const from = pool.length ? pool : cast;
  // With the numbers on (#211), whoever's mood is furthest from even leans first.
  if (weight) return weightedPick(from, weight, rand);
  return from.length ? from[Math.floor(rand() * from.length)] : undefined;
};

export const buildLifeEventPrompt = (character: Character, world: Pick<World, "name" | "premise" | "era">, people: string[]) =>
  [
    `${character.name} lives in ${world.name}: ${world.premise}${world.era ? ` (${world.era})` : ""}`,
    `About ${character.name}: ${[character.description, character.prompt].filter(Boolean).join(" ").slice(0, 500)}`,
    character.lifeEvents?.length ? `What happened to them lately: ${character.lifeEvents.slice(-3).map((e) => e.text).join("; ")}` : "",
    people.length ? `People in their life: ${people.slice(0, 8).join(", ")}` : "",
    `Something just happened in ${character.name}'s life that changes it a little or a lot: a new job, losing one, a move, an engagement, a breakup, a birth, an illness, a win, a loss, leaving town for a while or coming back. Keep it true to who they are and the world.`,
    `Answer with one sentence in the past tense about ${character.name}, in the third person, nothing else.`,
  ].filter(Boolean).join("\n");

export const cleanLifeEvent = (reply: string): string | undefined => {
  const text = reply.trim().split("\n").filter(Boolean)[0]?.replace(/^["“']|["”']$/g, "").trim();
  if (!text || text.length < 8) return undefined;
  return text.length > 240 ? `${text.slice(0, 237).trimEnd()}...` : text;
};

export const addLifeEvent = (character: Character, text: string, at: number): Character => ({
  ...character,
  lifeEvents: [...(character.lifeEvents || []), { text, at }].slice(-KEEP),
});

// For their own prompts: what happened in their life the last few weeks.
export const buildLifeNote = (character: Pick<Character, "lifeEvents"> | undefined, now: number): string | undefined => {
  const recent = (character?.lifeEvents || []).filter((e) => now - e.at < NOTE_FOR_MS);
  if (!recent.length) return undefined;
  const ago = (at: number) => {
    const days = Math.round((now - at) / DAY);
    return days < 1 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  };
  return `Things that happened in your life lately (real; they shape your mood and plans, bring them up when it fits):\n${recent.map((e) => `- ${e.text} (${ago(e.at)})`).join("\n")}`;
};

// Passing the time ages the world (#180): for a gap of a week or more, one
// helper call writes what happened in each resident's life meanwhile, and -
// where ties drift - how a pair of them stands now.
export const AGING_MIN_DAYS = 7;

export const buildGapLivesPrompt = (world: Pick<World, "name" | "premise">, gap: string, note: string | undefined, cast: Character[], withTies: boolean) =>
  [
    `${world.name}: ${world.premise}`,
    `${gap} have just passed there${note ? ` (meanwhile: ${note})` : ""}.`,
    "The people:",
    ...cast.map((c) => `- ${c.name}: ${[c.description, c.prompt].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 200)}${(c.ties || []).length ? ` (${(c.ties || []).map((t) => `${cast.find((x) => x.id === t.withId)?.name}: ${t.tie.replace(/^your\s+/i, "")}`).join(", ")})` : ""}`),
    `For each person, one sentence in the past tense: what happened in their life over those ${gap} - as much as that much time brings (a new job, a move, a baby, a loss, a habit picked up).`,
    withTies ? "Then, only for pairs whose relationship really changed over that time, one line each." : "",
    "Answer with lines like these, nothing else:",
    "LIFE: <name> | <sentence>",
    withTies ? "TIE: <name> | <name> | <what the second is to the first now> | <what the first is to the second now>" : "",
  ].filter(Boolean).join("\n");

export const parseGapLives = (reply: string, cast: Character[]) => {
  const byName = (n: string) => {
    const name = n.replace(/[*_"]/g, "").trim().toLowerCase();
    return cast.find((c) => c.name.toLowerCase() === name) || cast.find((c) => c.name.toLowerCase().split(/\s+/)[0] === name.split(/\s+/)[0]);
  };
  const lives: { id: number; text: string }[] = [];
  const ties: { a: number; b: number; bToA: string; aToB: string }[] = [];
  for (const raw of reply.split("\n")) {
    const line = raw.replace(/[*_]/g, "").replace(/^[\s-]+/, "");
    const life = line.match(/^LIFE\s*:\s*(.+)$/i);
    const tie = line.match(/^TIE\s*:\s*(.+)$/i);
    if (life) {
      const [who, text] = life[1].split("|").map((x) => x.trim());
      const c = who ? byName(who) : undefined;
      const clean = text ? cleanLifeEvent(text) : undefined;
      if (c && clean && !lives.some((l) => l.id === c.id)) lives.push({ id: c.id, text: clean });
    } else if (tie) {
      const [a, b, bToA, aToB] = tie[1].split("|").map((x) => x.trim());
      const ca = a ? byName(a) : undefined, cb = b ? byName(b) : undefined;
      if (ca && cb && ca.id !== cb.id && bToA && bToA.length <= 60) ties.push({ a: ca.id, b: cb.id, bToA, aToB: aToB && aToB.length <= 60 ? aToB : bToA });
    }
  }
  return { lives, ties };
};
