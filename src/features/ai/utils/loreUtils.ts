import { LoreEntry, Message } from "../../../types";
import { LORE_MAX_CHARS, LORE_RECURSION_DEPTH, LORE_SCAN_MESSAGE_COUNT } from "../../../utils/constants";

// Upper bounds for the per-entry advanced settings. A card or a stray edit
// can carry any number; these keep a "scan 1,000,000 messages" or "sticky
// forever" value from turning every reply into a full-history scan.
export const LORE_MAX_SCAN_DEPTH = 100;
export const LORE_MAX_STICKY = 100;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word, case-insensitive keyword test. A plain substring scan made
// "cat" fire on "category" and "art" on "party"; letter/digit lookarounds
// (rather than \b) keep this correct for non-ASCII names and for keywords
// that themselves start or end in punctuation ("Mr. Vance").
const keywordRegexCache = new Map<string, RegExp>();
const keywordRegex = (keyword: string): RegExp => {
  let re = keywordRegexCache.get(keyword);
  if (!re) {
    re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(keyword)}(?![\\p{L}\\p{N}_])`, "iu");
    keywordRegexCache.set(keyword, re);
  }
  return re;
};

const nonBlank = (keywords: string[] | undefined): string[] =>
  (keywords || []).map((kw) => kw.trim()).filter((kw) => kw !== "");

const keywordIn = (text: string) => (kw: string) => keywordRegex(kw).test(text);

// A primary keyword must appear. With `selective` on and at least one
// secondary keyword, the secondary list must also pass its logic; an empty
// secondary list leaves the entry primary-only, as SillyTavern does.
const entryMatches = (entry: LoreEntry, text: string): boolean => {
  const hit = keywordIn(text);
  if (!nonBlank(entry.keywords).some(hit)) return false;
  const secondary = entry.selective ? nonBlank(entry.secondaryKeywords) : [];
  if (secondary.length === 0) return true;
  switch (entry.secondaryLogic) {
    case "andAll": return secondary.every(hit);
    case "notAny": return !secondary.some(hit);
    case "notAll": return !secondary.every(hit);
    default: return secondary.some(hit);
  }
};

const clampInt = (value: number | undefined, min: number, max: number): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : undefined;

const scanDepthOf = (entry: LoreEntry): number => clampInt(entry.scanDepth, 0, LORE_MAX_SCAN_DEPTH) ?? LORE_SCAN_MESSAGE_COUNT;
const stickyOf = (entry: LoreEntry): number => clampInt(entry.sticky, 0, LORE_MAX_STICKY) ?? 0;
const priorityOf = (entry: LoreEntry): number =>
  typeof entry.priority === "number" && Number.isFinite(entry.priority) ? entry.priority : 0;

// FNV-1a over the string, then a murmur-style finalizer so neighbouring
// positions ("id:11", "id:12") don't land on neighbouring rolls.
const hashString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

// A roll in [0, 100) that depends only on the entry and the conversation
// position, never on Math.random: regenerating or editing the same turn has
// to see the same lore, or a "33% chance" entry would flicker in and out of
// one reply's variants.
export const loreRoll = (entryId: string, position: number): number =>
  (hashString(`${entryId}:${position}`) / 0x100000000) * 100;

const passesChance = (entry: LoreEntry, position: number): boolean => {
  const p = entry.probability;
  if (typeof p !== "number" || !Number.isFinite(p) || p >= 100) return true;
  if (p <= 0) return false;
  return loreRoll(entry.id, position) < p;
};

// Picks the lore entries to inject for the next reply, given the history
// that reply will see:
// 1. every enabled `constant` entry, keywords or not;
// 2. every enabled entry whose keywords match its scan window (the last
//    `scanDepth` messages, LORE_SCAN_MESSAGE_COUNT by default) - or matched
//    the window at any of the last `sticky` positions, which keeps it active
//    for that many messages after it fired without storing anything;
// 3. up to LORE_RECURSION_DEPTH more passes over the text of entries already
//    picked, so lore that names other lore pulls it in too.
// Any entry with a `probability` below 100 also has to pass a roll seeded by
// its id and the history length at the moment it fired (see loreRoll).
// The result is then capped at LORE_MAX_CHARS of content: constant entries
// first, then higher `priority`, ties in lorebook order, so a keyword-heavy
// scene can't blow up the prompt and the cut drops the least important lore.
export const matchLoreEntries = (entries: LoreEntry[] | undefined, messages: Message[]): LoreEntry[] => {
  if (!entries || entries.length === 0) return [];

  const candidates = entries.filter((e) => e.enabled !== false && e.content.trim());
  if (candidates.length === 0) return [];

  const now = messages.length;
  // Entries mostly share the default depth, so each (end, depth) window is
  // joined once per call rather than once per entry per sticky step.
  const windowCache = new Map<string, string>();
  const windowText = (end: number, depth: number): string => {
    const key = `${end}:${depth}`;
    let text = windowCache.get(key);
    if (text === undefined) {
      text = messages.slice(Math.max(0, end - depth), end).map((m) => m.txt || "").join("\n");
      windowCache.set(key, text);
    }
    return text;
  };

  const firedAt = (entry: LoreEntry, position: number): boolean => {
    const text = windowText(position, scanDepthOf(entry));
    return text.trim() !== "" && entryMatches(entry, text) && passesChance(entry, position);
  };

  const picked = new Set<LoreEntry>();
  candidates.forEach((e) => {
    if (e.constant) {
      if (passesChance(e, now)) picked.add(e);
      return;
    }
    for (let back = 0; back <= stickyOf(e) && now - back > 0; back++) {
      if (firedAt(e, now - back)) {
        picked.add(e);
        return;
      }
    }
  });

  let frontier = Array.from(picked);
  for (let depth = 0; depth < LORE_RECURSION_DEPTH && frontier.length > 0; depth++) {
    const text = frontier.map((e) => e.content).join("\n");
    frontier = candidates.filter((e) => !picked.has(e) && entryMatches(e, text) && passesChance(e, now));
    frontier.forEach((e) => picked.add(e));
  }

  // Array.prototype.sort is stable, so equal priorities keep lorebook order.
  const ordered = candidates
    .filter((e) => picked.has(e))
    .sort((a, b) => Number(b.constant === true) - Number(a.constant === true) || priorityOf(b) - priorityOf(a));

  const result: LoreEntry[] = [];
  let used = 0;
  for (const e of ordered) {
    const size = e.content.length;
    if (used + size > LORE_MAX_CHARS && result.length > 0) continue;
    result.push(e);
    used += size;
  }
  return result;
};

// Renders triggered entries into the dedicated system-prompt section the
// model sees - only called when at least one entry actually matched.
export const buildWorldInfoSection = (matched: LoreEntry[]): string =>
  `[World Info]\n${matched.map((e) => e.content).join("\n\n")}`;
