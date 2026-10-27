import { Character, World } from "../../types";
import { bondWords, moodOf, nudgeBond } from "./bonds";
import { audienceOf } from "./knowledge";
import type { TimelineEntry } from "./timeline";

// Catch-up that fits the absence (#213), for worlds on world turns (#212).
// Coming back after a day or a week used to bring the same few catch-up
// turns, so a week away felt like an afternoon. Now the numbers under the
// story (#211) move on by themselves for every day away - with no model
// call - and one call tells the gap as a short story from what was
// recorded meanwhile and how people stand now.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const CATCH_UP_MIN_MS = 12 * HOUR;
const MAX_DAYS = 14;

export const daysAway = (lastSeen: number, openedAt: number) => Math.min(MAX_DAYS, Math.max(0, (openedAt - lastSeen) / DAY));

// The numbers moving on: for every day away, each tied pair may hit a
// rough patch or warm up a little. Returns the patches to make, by
// character id, so the caller can save them through patchCharacter.
export const driftWhileAway = (cast: Character[], lastSeen: number, openedAt: number, rand: () => number = Math.random): Map<number, (c: Character) => Partial<Character>> => {
  const days = Math.floor(daysAway(lastSeen, openedAt));
  const nudges = new Map<string, { closeness: number; tension: number }>();
  const seen = new Set<string>();
  for (const c of cast) {
    for (const t of c.ties || []) {
      if (!cast.some((x) => x.id === t.withId)) continue;
      const key = c.id < t.withId ? `${c.id}-${t.withId}` : `${t.withId}-${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let closeness = 0;
      let tension = 0;
      for (let d = 0; d < days; d++) {
        const roll = rand();
        if (roll < 0.12) {
          tension += 15;
          closeness -= 5;
        } else if (roll < 0.3) closeness += 4;
      }
      if (closeness || tension) nudges.set(key, { closeness, tension });
    }
  }
  // Each side of each pair, gathered per person, applied in one patch.
  const perPerson = new Map<number, { other: number; nudge: { closeness: number; tension: number } }[]>();
  nudges.forEach((nudge, key) => {
    const [x, y] = key.split("-").map(Number);
    perPerson.set(x, [...(perPerson.get(x) || []), { other: y, nudge }]);
    perPerson.set(y, [...(perPerson.get(y) || []), { other: x, nudge }]);
  });
  const patches = new Map<number, (c: Character) => Partial<Character>>();
  perPerson.forEach((list, id) =>
    patches.set(id, (c) => ({ bonds: list.reduce((cur, { other, nudge }) => ({ ...cur, ...nudgeBond(cur, other, nudge, openedAt) }), c).bonds }))
  );
  return patches;
};

// What the story is told from: what was recorded while you were away
// (never what was secret), and how people stand now when it stands out.
export const catchUpFacts = (cast: Character[], entries: TimelineEntry[], lastSeen: number, openedAt: number): string[] => {
  const happened = entries
    .filter((e) => e.at > lastSeen && e.at <= openedAt && audienceOf(e) !== "secret" && e.kind !== "begin")
    .slice(-20)
    .map((e) => e.text);
  const standing: string[] = [];
  const named = (id: number) => cast.find((c) => c.id === id)?.name;
  for (const c of cast) {
    for (const t of c.ties || []) {
      if (t.withId < c.id || !named(t.withId)) continue;
      const words = bondWords(c, t.withId, openedAt);
      if (words) standing.push(`${c.name} and ${named(t.withId)}: ${words}`);
    }
    const mood = moodOf(c, openedAt);
    if (mood <= -30) standing.push(`${c.name} has been low`);
    else if (mood >= 30) standing.push(`${c.name} is in high spirits`);
  }
  return [...happened, ...standing.slice(0, 8)];
};

export const buildCatchUpPrompt = (world: Pick<World, "name" | "premise" | "era">, facts: string[], days: number, userName: string) =>
  [
    `${userName} has been away from ${world.name} (${world.premise}${world.era ? `, ${world.era}` : ""}) for ${days < 1.5 ? "about a day" : `${Math.round(days)} days`}. Tell them what they missed, like a friend catching them up.`,
    "",
    "What happened and how people are now:",
    ...facts.map((f) => `- ${f}`),
    "",
    "- 3 to 5 sentences, past tense, plain and warm, naming people.",
    "- Only from the list above: don't invent events, deaths, couples or anything big.",
    "- No heading, no list, no quotes.",
  ].join("\n");

export const cleanCatchUp = (reply: string): string | undefined => {
  const text = reply.replace(/^\s*(here'?s[^\n:]*:|sure[^\n]*\n)/i, "").replace(/^#+.*\n/, "").replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
  return text.length >= 20 ? text.slice(0, 900) : undefined;
};

// The card's heading, by how long it was.
export const catchUpTitle = (world: Pick<World, "name">, lastSeen: number, openedAt: number) => {
  const days = Math.round((openedAt - lastSeen) / DAY);
  return days <= 1 ? `Since yesterday in ${world.name}` : days < 7 ? `These ${days} days in ${world.name}` : days < 14 ? `This past week in ${world.name}` : `These weeks in ${world.name}`;
};
