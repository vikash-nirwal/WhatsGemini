import { Character, World } from "../../types";

// Arrivals, departures and life events (#164): over story time things
// happen to the people in a world - a new job, a move, an engagement, a
// loss, leaving town for a while - and now and then someone new turns up,
// tied to someone already there, for you to welcome or turn away.

const DAY = 24 * 60 * 60 * 1000;
const KEEP = 8;
export const LIFE_GAP_MS = 3 * DAY;
export const NEWCOMER_GAP_MS = 10 * DAY;
const NOTE_FOR_MS = 21 * DAY;

export const lifeEventDue = (world: Pick<World, "lastLifeAt">, now: number, gapMs: number = LIFE_GAP_MS, rand: () => number = Math.random) =>
  now - (world.lastLifeAt || 0) >= gapMs && rand() < 0.6;

export const newcomerDue = (world: Pick<World, "lastNewcomerAt" | "newcomer">, castSize: number, now: number, gapMs: number = NEWCOMER_GAP_MS, rand: () => number = Math.random) =>
  !world.newcomer && castSize >= 2 && now - (world.lastNewcomerAt || 0) >= gapMs && rand() < 0.5;

// Whose life moves on: anyone, but less often someone it just happened to.
export const pickLifeSubject = (cast: Character[], now: number, rand: () => number = Math.random): Character | undefined => {
  const pool = cast.filter((c) => !(c.lifeEvents || []).some((e) => now - e.at < 7 * DAY));
  const from = pool.length ? pool : cast;
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
