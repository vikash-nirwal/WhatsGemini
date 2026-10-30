import { Character, MemoryCategory } from "../../types";
import { applyMemoryChanges, carryMemoryCategories, MemoryChanges, NO_MEMORY_CHANGES } from "../ai/utils/memoryExtraction";
import { carryMemoryDates } from "../ai/utils/memoryTime";

// Memory that crosses from one place to another (#228 groups, #229 adventures). A group's facts used to
// stay in the group (Chat.memory) and an adventure's in the adventure, so
// a confession at the bonfire was gone from the private chat after three
// days, and someone cast in a story never remembered it. Now each person
// who was there takes the new facts into their own memory, labelled with
// where they happened, through the same merge as their own chats' facts
// (no duplicates, the cap, dates and categories).

// "In the group "Bonfire": Sam can't swim."
export const labelled = (where: string, fact: string) => `${where}: ${fact.trim()}`;

// The fields to patch onto `c` for facts they now remember.
export const rememberFacts = (c: Pick<Character, "memory" | "pinnedMemory" | "memoryCategories" | "memoryDates">, facts: string[], categories: Record<string, MemoryCategory> | undefined, now: number): Partial<Character> => {
  if (!facts.length) return {};
  const existing = c.memory || [];
  const pinned = c.pinnedMemory || [];
  const changes: MemoryChanges = { ...NO_MEMORY_CHANGES, added: facts, categories };
  const memory = applyMemoryChanges(existing, changes, pinned);
  if (memory.length === existing.length && memory.every((f, i) => f === existing[i])) return {};
  return {
    memory,
    memoryCategories: carryMemoryCategories(memory, pinned, c.memoryCategories, existing, changes),
    memoryDates: carryMemoryDates(memory, pinned, c.memoryDates, existing, changes, now),
  };
};

// How a group's facts are labelled in a member's own memory.
export const groupLabel = (groupTitle: string) => `In the group "${groupTitle}"`;

// A group's new facts, as each member will remember them.
export const groupFactsFor = (groupTitle: string, added: string[], categories: Record<string, MemoryCategory> | undefined) => {
  const where = groupLabel(groupTitle);
  const facts = added.map((f) => labelled(where, f));
  const labelledCategories = categories ? Object.fromEntries(added.flatMap((f) => (categories[f] ? [[labelled(where, f), categories[f]]] : []))) : undefined;
  return { facts, categories: labelledCategories };
};

const firstName = (name: string) => name.trim().split(/\s+/)[0];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// An adventure's facts that one cast member was part of: the narrator
// voices everyone, so only facts naming them (or "everyone") are theirs.
export const adventureFactsFor = (title: string, facts: string[], name: string): string[] => {
  const who = new RegExp(`(?<![\\p{L}\\p{N}_])(${escape(firstName(name))}|everyone|the whole party|the party)(?![\\p{L}\\p{N}_])`, "iu");
  return facts.filter((f) => who.test(f)).map((f) => labelled(`In the story "${title}"`, f));
};
