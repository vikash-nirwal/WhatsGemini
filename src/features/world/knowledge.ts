import { Character } from "../../types";
import type { TimelineEntry, TimelineKind } from "./timeline";

// What each person knows (#203, #204): the world's timeline is the one
// record of what happened, and each entry says who can know it. Every
// prompt that speaks for a character asks here instead of guessing, so a
// talk between two people, a group of theirs and your own chat all agree
// on what that person knows and what they only heard.

export type Audience = NonNullable<TimelineEntry["audience"]>;

const DAY_MS = 24 * 60 * 60 * 1000;

// Entries from before #203 have no audience: what the whole world saw is
// public, the rest (ties, talks, what you did) belongs to the people in it.
const PUBLIC_KINDS: TimelineKind[] = ["begin", "arrival", "departure", "god", "time", "event", "arc"];

export const audienceOf = (e: TimelineEntry): Audience => e.audience ?? (PUBLIC_KINDS.includes(e.kind) ? "public" : "private");

// Knows it first-hand: they were in it, or, when the entry names who knows
// (someone told you a secret about others), they're one of those.
const firstHand = (e: TimelineEntry, id: number) => Boolean((e.knownBy || e.characterIds)?.includes(id));

export const knowsEntry = (e: TimelineEntry, id: number) =>
  audienceOf(e) === "public" || firstHand(e, id) || Boolean(e.heard?.some((h) => h.id === id));

export interface KnownItem {
  entry: TimelineEntry;
  from?: number; // heard it from them, rather than being there
  secret: boolean;
}

// What one character knows, oldest first: public news of the last few days
// (older history is in the world brief), and what they were in or heard
// within the last few weeks. What's been folded into a shorter line (#207)
// is left out; the folded line stands for it. "god" truths are in every
// prompt already.
export const knownTo = (id: number, entries: TimelineEntry[], now: number, { max = 8, publicDays = 3, privateDays = 21 } = {}): KnownItem[] =>
  entries
    .filter((e) => e.kind !== "god" && e.kind !== "begin" && !e.folded?.includes(id) && knowsEntry(e, id))
    .filter((e) => now - e.at < (audienceOf(e) === "public" ? publicDays : privateDays) * DAY_MS)
    .slice(-max)
    .map((e) => ({ entry: e, from: firstHand(e, id) || audienceOf(e) === "public" ? undefined : e.heard?.find((h) => h.id === id)?.from, secret: audienceOf(e) === "secret" }));

const nameIn = (characters: Pick<Character, "id" | "name">[]) => (id: number) => characters.find((c) => c.id === id)?.name || "someone";

const itemLine = (item: KnownItem, nameOf: (id: number) => string) =>
  `${item.secret ? "(a secret: keep it) " : ""}${item.from !== undefined ? `(heard from ${nameOf(item.from)}) ` : ""}${item.entry.text}`;

// For a character's own chats with you (1:1 or a group): what they know
// lately, beyond the world brief. Public news is left to the brief and the
// events note; this is what's theirs.
export const buildKnowsNote = (character: Pick<Character, "id" | "name" | "knownSummary"> | undefined, entries: TimelineEntry[], characters: Pick<Character, "id" | "name">[], now: number): string | undefined => {
  if (!character) return undefined;
  const items = knownTo(character.id, entries, now).filter((i) => audienceOf(i.entry) !== "public");
  if (!items.length && !character.knownSummary) return undefined;
  return [
    "What you know that not everyone does (use it only if it fits; what you heard is hearsay, it may be wrong, and you know who told you):",
    ...(character.knownSummary ? [`- From before: ${character.knownSummary}`] : []),
    ...items.map((i) => `- ${itemLine(i, nameIn(characters))}`),
  ].join("\n");
};

// Memory condensing (#207): once someone knows a lot that isn't public,
// the oldest of it folds into their one-line summary on the helper model,
// so their prompts stay small and the gist stays with them.
export const FOLD_AT = 10;
const FOLD_COUNT = 6;
const FOLD_AFTER_MS = 3 * DAY_MS;

export const foldDue = (id: number, entries: TimelineEntry[], now: number): TimelineEntry[] => {
  const mine = entries.filter((e) => audienceOf(e) !== "public" && e.kind !== "god" && !e.folded?.includes(id) && knowsEntry(e, id));
  if (mine.length < FOLD_AT) return [];
  return mine.filter((e) => now - e.at >= FOLD_AFTER_MS).slice(0, FOLD_COUNT);
};

export const buildFoldPrompt = (character: Pick<Character, "id" | "name" | "knownSummary">, items: TimelineEntry[], characters: Pick<Character, "id" | "name">[]) => {
  const nameOf = nameIn(characters);
  const lines = items.map((e) => {
    const from = e.heard?.find((h) => h.id === character.id)?.from;
    return `- ${audienceOf(e) === "secret" ? "(a secret) " : ""}${from !== undefined && !(e.knownBy || e.characterIds)?.includes(character.id) ? `(heard from ${nameOf(from)}) ` : ""}${e.text}`;
  });
  return [
    `Fold what ${character.name} knows into one short paragraph of their memory, at most 60 words, in the third person.`,
    character.knownSummary ? `What they already remembered: ${character.knownSummary}` : "",
    "What to fold in:",
    ...lines,
    "Keep who did what, who told them, and what's a secret; drop small talk. Reply with only the paragraph.",
  ].filter(Boolean).join("\n");
};

export const cleanFold = (reply: string): string | undefined => {
  const text = reply.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ");
  return text.length >= 10 ? text.slice(0, 600) : undefined;
};

export const markFolded = (entries: TimelineEntry[], ids: string[], who: number): TimelineEntry[] =>
  entries.map((e) => (ids.includes(e.id) && !e.folded?.includes(who) ? { ...e, folded: [...(e.folded || []), who] } : e));

// What one person in a talk could tell the others: things they know that
// someone there doesn't. Private things about other people only pass on
// through those who talk (their "Talks about you" switch, #98); secrets
// never do. Numbered, so the talk can say what was told.
export interface Shareable {
  n: number;
  entryId: string;
  tellerId: number;
}

export const buildShareSection = (
  people: Pick<Character, "id" | "name" | "spreadsRumors">[],
  entries: TimelineEntry[],
  now: number,
  everyone: Pick<Character, "id" | "name">[] = people // for naming who told them
): { text?: string; items: Shareable[] } => {
  const nameOf = nameIn(everyone);
  const items: Shareable[] = [];
  const lines: string[] = [];
  const kept: string[] = [];
  for (const p of people) {
    for (const item of knownTo(p.id, entries, now, { max: 6 })) {
      if (audienceOf(item.entry) === "public" || items.some((s) => s.entryId === item.entry.id)) continue;
      if (people.every((o) => knowsEntry(item.entry, o.id))) continue;
      if (item.secret) {
        kept.push(`${p.name} keeps this to themselves: ${item.entry.text}`);
        continue;
      }
      // Their own news they can tell; someone else's only a talker passes on.
      const own = Boolean(item.entry.characterIds?.includes(p.id)) && item.from === undefined;
      if (!own && !p.spreadsRumors) continue;
      const n = items.length + 1;
      items.push({ n, entryId: item.entry.id, tellerId: p.id });
      lines.push(`[${n}] ${p.name} knows: ${itemLine(item, nameOf)}`);
    }
  }
  if (!lines.length && !kept.length) return { items };
  return {
    items,
    text: [
      ...(lines.length ? ["What one of them knows that the others may not. They can bring it up if it comes up naturally, the way they would - a gossip tells, a private person doesn't, and what they heard comes with who said it:", ...lines] : []),
      ...kept,
    ].join("\n"),
  };
};

// The talk's own account of what was passed on: "SHARED: 1, 3" or "none".
export const parseShared = (reply: string): number[] => {
  const m = reply.match(/^[\s*_-]*SHARED\s*:\s*(.+)$/im);
  if (!m) return [];
  return Array.from(new Set((m[1].match(/\d+/g) || []).map(Number)));
};

// Something new about their own lives that came out ("NEW: ..."), which
// others can hear about later.
export const parseNewFact = (reply: string): string | undefined => {
  const m = reply.match(/^[\s*_-]*NEW\s*:\s*(.+)$/im);
  const text = m?.[1].replace(/[*_]/g, "").trim().replace(/^["']|["']$/g, "");
  if (!text || text.length < 8 || text.length > 220 || /^(none|nothing|n\/a)\b/i.test(text)) return undefined;
  return text;
};

// The lines a talk ends with, for its prompt.
export const SHARE_ASK = (hasItems: boolean) =>
  [
    hasItems ? "- Then one more line: SHARED: <the numbers of the things above someone actually told in this conversation>, or SHARED: none." : "",
    "- If something new about their own lives comes out here that others could hear about later (news, a plan, a falling-out), add one line: NEW: <it, in one short sentence, with names>. Most talks have none; then leave it out.",
  ].filter(Boolean);

// Who heard what (#206): each listener who didn't know an item now heard it
// from its teller.
export const applyShared = (entries: TimelineEntry[], items: Shareable[], numbers: number[], listeners: number[], at: number): TimelineEntry[] => {
  const told = items.filter((s) => numbers.includes(s.n));
  if (!told.length) return entries;
  return entries.map((e) => {
    const share = told.find((s) => s.entryId === e.id);
    if (!share) return e;
    const fresh = listeners.filter((id) => id !== share.tellerId && !knowsEntry(e, id));
    return fresh.length ? { ...e, heard: [...(e.heard || []), ...fresh.map((id) => ({ id, from: share.tellerId, at }))] } : e;
  });
};
