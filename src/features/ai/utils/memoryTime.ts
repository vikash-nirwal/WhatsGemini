import { MemoryFactDates } from "../../../types";
import { MemoryChanges } from "./memoryExtraction";

// Memory with time (#109): each fact remembers when it was learned and when
// it last came up, in a map keyed by the fact's text (like the categories),
// so the character can say "you told me back in March", bring up something
// from a while back now and then (a callback, one offer every couple of
// days), and - with the switch on - misremember a small detail and correct
// themselves. Facts from before this existed simply have no date.

const DAY_MS = 24 * 60 * 60 * 1000;
export const CALLBACK_GAP_MS = 2 * DAY_MS;
// A fact is "from a while back" once it's this old and hasn't come up since.
export const CALLBACK_MIN_AGE_MS = 7 * DAY_MS;
// Younger than this, "you told me on Tuesday" reads oddly: no date shown.
const SHOW_DATE_AFTER_MS = 2 * DAY_MS;

// The dates to save with a new memory list: new facts are learned now,
// a reworded fact keeps its date under its new wording, a fact that came up
// again (reinforced or updated) is mentioned now, and facts no longer in the
// list drop out. `pinned` facts are kept too.
export const carryMemoryDates = (
  merged: string[],
  pinned: string[],
  previous: Record<string, MemoryFactDates> | undefined,
  existing: string[],
  changes: MemoryChanges,
  now: number
): Record<string, MemoryFactDates> | undefined => {
  const renamedFrom = new Map(changes.updated.map((u) => [u.text, existing[u.index]]));
  const mentioned = new Set([...changes.updated.map((u) => u.text), ...changes.reinforced.map((i) => existing[i])]);
  return memoryDatesFor([...pinned, ...merged], previous, renamedFrom, mentioned, now);
};

// The same for a list edited by hand (the Memory tab): `renamedFrom` maps a
// fact's new wording to its old one.
export const memoryDatesFor = (
  facts: string[],
  previous: Record<string, MemoryFactDates> | undefined,
  renamedFrom: Map<string, string>,
  mentioned: Set<string>,
  now: number
): Record<string, MemoryFactDates> | undefined => {
  const result: Record<string, MemoryFactDates> = {};
  for (const fact of facts) {
    const oldText = renamedFrom.get(fact);
    const before = previous?.[fact] ?? (oldText !== undefined ? previous?.[oldText] : undefined);
    const dates: MemoryFactDates = before ? { ...before } : { learnedAt: now };
    if (mentioned.has(fact) && before) dates.mentionedAt = now;
    result[fact] = dates;
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "12 Mar", or "12 Mar 2025" in another year; nothing for the last two days.
export const formatLearned = (learnedAt: number, now: number): string | undefined => {
  if (now - learnedAt < SHOW_DATE_AFTER_MS) return undefined;
  const d = new Date(learnedAt);
  const year = d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
};

// The facts as the prompt lists them, with when each was learned.
export const annotateFacts = (facts: string[], dates: Record<string, MemoryFactDates> | undefined, now: number): string[] =>
  facts.map((fact) => {
    const learned = dates?.[fact] ? formatLearned(dates[fact].learnedAt, now) : undefined;
    return learned ? `${fact} (learned ${learned})` : fact;
  });

export const MEMORY_DATES_NOTE = `"learned" dates say when you came to know a fact. Refer to them the way a person would ("you told me back in March", "that was months ago"), never as data, and only when it fits.`;

export const callbackDue = (chat: { callbackAt?: number } | undefined, now: number): boolean =>
  !chat?.callbackAt || now - chat.callbackAt >= CALLBACK_GAP_MS;

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// One fact from a while back: learned at least a week ago and not come up
// since, picked from `seed` (the chat and the day) so the offer holds all day.
export const pickCallback = (facts: string[], dates: Record<string, MemoryFactDates> | undefined, now: number, seed: string): { fact: string; learnedAt: number } | undefined => {
  if (!dates) return undefined;
  const old = facts.filter((fact) => {
    const d = dates[fact];
    return d && now - Math.max(d.learnedAt, d.mentionedAt || 0) >= CALLBACK_MIN_AGE_MS;
  });
  if (old.length === 0) return undefined;
  const fact = old[hash(seed) % old.length];
  return { fact, learnedAt: dates[fact].learnedAt };
};

const ago = (then: number, now: number): string => {
  const days = Math.round((now - then) / DAY_MS);
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
};

export const buildCallbackDirective = (name: string, userName: string, fact: string, learnedAt: number, now: number): string =>
  `If it fits naturally, ${name} brings up something from a while back that they still remember about ${userName}: "${fact}" (${name} learned it ${ago(learnedAt, now)}) - asking how it turned out, or just that it came to mind. Only if it fits the conversation; never force it in.`;

export const buildMisrememberDirective = (name: string): string =>
  `Once in a long while, ${name} gets a small detail of one of the remembered facts slightly wrong (a name, a number, a day) and corrects themselves in the same reply, the way people do. Never anything that matters, and not more than once in a conversation.`;
