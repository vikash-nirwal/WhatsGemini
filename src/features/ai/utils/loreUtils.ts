import { LoreEntry, Message } from "../../../types";
import { LORE_SCAN_MESSAGE_COUNT } from "../../../utils/constants";

// Finds every enabled lore entry with at least one keyword present in the
// last LORE_SCAN_MESSAGE_COUNT messages - a plain case-insensitive substring
// scan (not Aho-Corasick) since entry/keyword counts here are small and this
// runs once per reply, not per character of a huge corpus.
export const matchLoreEntries = (entries: LoreEntry[] | undefined, messages: Message[]): LoreEntry[] => {
  if (!entries || entries.length === 0) return [];

  const recent = messages.slice(-LORE_SCAN_MESSAGE_COUNT);
  const haystack = recent.map((m) => m.txt || "").join("\n").toLowerCase();
  if (!haystack.trim()) return [];

  return entries.filter((entry) => {
    if (entry.enabled === false) return false;
    if (!entry.content.trim()) return false;
    return entry.keywords.some((kw) => kw.trim() && haystack.includes(kw.trim().toLowerCase()));
  });
};

// Renders triggered entries into the dedicated system-prompt section the
// model sees - only called when at least one entry actually matched.
export const buildWorldInfoSection = (matched: LoreEntry[]): string =>
  `[World Info]\n${matched.map((e) => e.content).join("\n\n")}`;
