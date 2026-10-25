import { lifeScaled } from "../life/lifeDial";
import { Character, Preoccupation } from "../../types";

// Their own preoccupations (#110): with the switch on, once a week the helper
// model writes two or three things the character is dealing with or looking
// forward to in their own life (a deadline, a friend's drama, something they
// want to try), and says which of the current ones are over and how. They go
// into replies, first texts (#93) and statuses (#8), so the character has
// something of their own to bring up, and they move on over the weeks.
// Secrets (#81) and plans (#84) are about you; these aren't.

export const CONCERNS_GAP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_OPEN = 4;
const KEEP_RESOLVED = 4;

export const openConcerns = (concerns: Preoccupation[] | undefined): Preoccupation[] => (concerns || []).filter((c) => !c.resolvedAt);
export const resolvedConcerns = (concerns: Preoccupation[] | undefined): Preoccupation[] => (concerns || []).filter((c) => c.resolvedAt);

// Due with the switch on, once a week counted from the last writing.
export const concernsDue = (character: Pick<Character, "preoccupations" | "concernsWrittenAt"> | undefined, now: number): boolean =>
  Boolean(character?.preoccupations) && (!character?.concernsWrittenAt || now - character.concernsWrittenAt >= lifeScaled(CONCERNS_GAP_MS));

export interface ConcernsContext {
  routine?: string; // the schedule section (#7)
  dayLog?: string; // today's account (#107)
  facts: string[];
  current: Preoccupation[]; // what they're dealing with now
}

const daysAgo = (since: number, now: number): string => {
  const days = Math.round((now - since) / (24 * 60 * 60 * 1000));
  return days < 1 ? "today" : days === 1 ? "yesterday" : days < 14 ? `${days} days ago` : `${Math.round(days / 7)} weeks ago`;
};

export const buildConcernsPrompt = (character: Pick<Character, "name" | "description" | "prompt">, now: number, ctx: ConcernsContext): string =>
  `What is ${character.name} dealing with, or looking forward to, in their own life this week?

About ${character.name}: ${[character.description, character.prompt].filter(Boolean).join(" ").slice(0, 600)}
${ctx.routine ? `${ctx.routine}\n` : ""}${ctx.dayLog ? `Today: ${ctx.dayLog}\n` : ""}${ctx.facts.length > 0 ? `Things going on lately:\n- ${ctx.facts.slice(0, 8).join("\n- ")}\n` : ""}${ctx.current.length > 0 ? `What they've been dealing with until now:\n${ctx.current.map((c, i) => `${i + 1}. ${c.text} (since ${daysAgo(c.since, now)})`).join("\n")}\n` : ""}
Write one line per item, nothing else:
- NEW: <something new, one short sentence in the third person: a deadline, a worry, a small project, something they want to try, a friend's drama>. Two or three of these, ordinary and specific, in keeping with their life and world. Nothing about the person they text.
${ctx.current.length > 0 ? `- DONE <number>: <how it ended, a few words> for any of the current items that would be over by now. Leave the rest alone.\n` : ""}`;

export interface ConcernsUpdate {
  added: string[];
  done: { index: number; outcome: string }[];
}

export const parseConcerns = (reply: string, currentCount: number): ConcernsUpdate => {
  const update: ConcernsUpdate = { added: [], done: [] };
  for (const raw of reply.split("\n")) {
    const line = raw.replace(/^[\s*\-•]+/, "").trim();
    const added = line.match(/^NEW\s*:\s*(.+)$/i);
    const done = line.match(/^DONE\s*(\d+)\s*:\s*(.+)$/i);
    if (added && added[1].trim().length > 3) update.added.push(added[1].trim().replace(/^["“]|["”]$/g, ""));
    else if (done) {
      const index = Number(done[1]) - 1;
      if (index >= 0 && index < currentCount) update.done.push({ index, outcome: done[2].trim() });
    }
  }
  return update;
};

// The list after a week's writing: finished ones keep their outcome (the
// last few), the open ones that weren't finished stay, new ones join, and the
// open list stays short.
export const applyConcerns = (concerns: Preoccupation[] | undefined, update: ConcernsUpdate, now: number): Preoccupation[] => {
  const open = openConcerns(concerns);
  const doneByIndex = new Map(update.done.map((d) => [d.index, d.outcome]));
  const stillOpen = open.filter((_, i) => !doneByIndex.has(i));
  const newlyDone = open.flatMap((c, i) => (doneByIndex.has(i) ? [{ ...c, resolvedAt: now, outcome: doneByIndex.get(i) }] : []));
  const added = update.added.map((text, i) => ({ id: `pc-${now.toString(36)}-${i}`, text, since: now }));
  const resolved = [...resolvedConcerns(concerns), ...newlyDone].slice(-KEEP_RESOLVED);
  return [...resolved, ...[...stillOpen, ...added].slice(-MAX_OPEN)];
};

export const dropConcern = (concerns: Preoccupation[] | undefined, id: string): Preoccupation[] => (concerns || []).filter((c) => c.id !== id);

// The prompt's note, and the one-liner first texts and statuses get.
export const buildConcernsSection = (name: string, concerns: Preoccupation[] | undefined, now: number): string | undefined => {
  const open = openConcerns(concerns);
  const recent = resolvedConcerns(concerns).filter((c) => now - (c.resolvedAt || 0) < CONCERNS_GAP_MS);
  if (open.length === 0 && recent.length === 0) return undefined;
  return [
    `Things going on in ${name}'s own life right now - bring them up when it fits, the way a person mentions what's on their mind, and let them move on over the days:`,
    ...open.map((c) => `- ${c.text} (since ${daysAgo(c.since, now)})`),
    ...(recent.length > 0 ? [`Recently over: ${recent.map((c) => `${c.text} - ${c.outcome || "it's done"}`).join("; ")}`] : []),
  ].join("\n");
};

export const concernsLine = (concerns: Preoccupation[] | undefined): string | undefined => {
  const open = openConcerns(concerns);
  return open.length > 0 ? open.map((c) => c.text).join("; ") : undefined;
};
