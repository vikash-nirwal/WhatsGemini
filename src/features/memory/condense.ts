import { Character, MemoryCategory, MemoryFactDates } from "../../types";

// Condensing old facts (#232). Memory used to grow to the cap (200) and
// then drop whatever nobody had mentioned in a while, gist and all, and
// every memory update sent the model the whole list. Now, once the list
// passes CONDENSE_AT, its least recently touched facts (the front of the
// list, see applyMemoryChanges) are folded into a few lines on the helper
// model: repeats merged, what's no longer true dropped, what matters kept.
// The list stays small enough to send and to pick from, and the old things
// are still remembered, roughly, the way people remember.
//
// CONDENSE_AT was 150 until 2026-10-30: replies only ever see 30 facts, but
// every memory update sends the whole list, and group facts copied to each
// member filled lists fast. At 80 a list stays between about 50 and 80.
export const CONDENSE_AT = 80;
export const CONDENSE_COUNT = 30;
export const CONDENSE_INTO = 8;

export type Memoryful = Pick<Character, "memory" | "pinnedMemory" | "memoryCategories" | "memoryDates">;

export const condenseDue = (m: Memoryful) => (m.memory || []).length > CONDENSE_AT;

export const buildCondensePrompt = (ownerName: string, userName: string, facts: string[], categories: Record<string, MemoryCategory> = {}) =>
  [
    `These are ${facts.length} of ${ownerName}'s oldest memories from their story with ${userName}, the ones that haven't come up in a while:`,
    ...facts.map((f) => `- ${categories[f] ? `[${categories[f]}] ` : ""}${f}`),
    "",
    `Rewrite them as at most ${CONDENSE_INTO} short lines that keep everything that still matters: names, what ${userName} likes and is like, promises, how things between them changed, what happened and how it ended. Merge facts that say the same thing or belong together. Leave out what's trivial, or no longer true because a later fact replaced it. Keep a place or event's name (like a group's or a story's) when it says where something happened.`,
    `One fact per line, each starting with its category: [user] (about ${userName}), [relationship] (between ${ownerName} and ${userName}) or [story] (events, plans, places, things). Nothing else.`,
  ].join("\n");

export const parseCondensed = (reply: string, folded: number): { facts: string[]; categories: Record<string, MemoryCategory> } | undefined => {
  const facts: string[] = [];
  const categories: Record<string, MemoryCategory> = {};
  for (const raw of reply.split("\n")) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    const m = line.match(/^\[\s*(user|relationship|story)\s*\]\s*(.+)$/i);
    const fact = (m ? m[2] : "").replace(/\s+/g, " ").trim();
    if (!fact || fact.length > 300 || facts.includes(fact)) continue;
    facts.push(fact);
    categories[fact] = m![1].toLowerCase() as MemoryCategory;
  }
  // Too few lines back means it went wrong; as many as went in saves nothing.
  if (!facts.length || facts.length >= folded) return undefined;
  return { facts: facts.slice(0, CONDENSE_INTO), categories };
};

// The memory with its first `count` facts replaced by the condensed ones.
// Each keeps the earliest date among what it was folded from, so "you told
// me back in March" still holds (#109).
export const applyCondensed = (m: Memoryful, count: number, condensed: { facts: string[]; categories: Record<string, MemoryCategory> }): Required<Pick<Memoryful, "memory">> & Pick<Memoryful, "memoryCategories" | "memoryDates"> => {
  const memory = m.memory || [];
  const folded = memory.slice(0, count);
  const rest = memory.slice(count);
  const pinned = new Set(m.pinnedMemory || []);
  const added = condensed.facts.filter((f) => !pinned.has(f) && !rest.includes(f));
  const learnedAt = Math.min(...folded.map((f) => m.memoryDates?.[f]?.learnedAt ?? Infinity));
  const keep = (map: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(map || {}).filter(([k]) => !folded.includes(k) || rest.includes(k) || pinned.has(k)));
  const dates = { ...(keep(m.memoryDates) as Record<string, MemoryFactDates>), ...(Number.isFinite(learnedAt) ? Object.fromEntries(added.map((f) => [f, { learnedAt }])) : {}) };
  const categories = { ...(keep(m.memoryCategories) as Record<string, MemoryCategory>), ...Object.fromEntries(added.map((f) => [f, condensed.categories[f]])) };
  return {
    memory: [...added, ...rest],
    memoryCategories: Object.keys(categories).length ? categories : undefined,
    memoryDates: Object.keys(dates).length ? dates : undefined,
  };
};
