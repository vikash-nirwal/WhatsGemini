import { LoreEntry, Message } from "../../../types";
import { LORE_MAX_CHARS, LORE_RECURSION_DEPTH, LORE_SCAN_MESSAGE_COUNT } from "../../../utils/constants";

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

const entryMatches = (entry: LoreEntry, text: string): boolean =>
  entry.keywords.some((kw) => {
    const trimmed = kw.trim();
    return trimmed !== "" && keywordRegex(trimmed).test(text);
  });

// Picks the lore entries to inject for the next reply:
// 1. every enabled `constant` entry, keywords or not;
// 2. every enabled entry with a keyword in the last LORE_SCAN_MESSAGE_COUNT messages;
// 3. up to LORE_RECURSION_DEPTH more passes over the text of entries already
//    picked, so lore that names other lore pulls it in too.
// The result is then capped at LORE_MAX_CHARS of content, in that priority
// order (constant first, then lorebook order), so a keyword-heavy scene
// can't blow up the prompt.
export const matchLoreEntries = (entries: LoreEntry[] | undefined, messages: Message[]): LoreEntry[] => {
  if (!entries || entries.length === 0) return [];

  const candidates = entries.filter((e) => e.enabled !== false && e.content.trim());
  if (candidates.length === 0) return [];

  const recent = messages.slice(-LORE_SCAN_MESSAGE_COUNT);
  const haystack = recent.map((m) => m.txt || "").join("\n");

  const picked = new Set<LoreEntry>(candidates.filter((e) => e.constant));
  if (haystack.trim()) {
    candidates.forEach((e) => { if (entryMatches(e, haystack)) picked.add(e); });
  }

  let frontier = Array.from(picked);
  for (let depth = 0; depth < LORE_RECURSION_DEPTH && frontier.length > 0; depth++) {
    const text = frontier.map((e) => e.content).join("\n");
    frontier = candidates.filter((e) => !picked.has(e) && entryMatches(e, text));
    frontier.forEach((e) => picked.add(e));
  }

  const ordered = [
    ...candidates.filter((e) => e.constant && picked.has(e)),
    ...candidates.filter((e) => !e.constant && picked.has(e)),
  ];

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
