import { MAX_MEMORY_ENTRIES } from "../../../utils/constants";
import { UsageInfo } from "../types";
import { ChatProviderAdapter, ProviderRuntimeConfig } from "../providers/types";

// What one extraction pass wants done to the memory list. Updates, forgets
// and reinforcements refer to facts by their index in the (unpinned) memory
// list the model was shown, so they never depend on the model copying a
// fact's wording back exactly.
export interface MemoryChanges {
  added: string[];
  updated: { index: number; text: string }[];
  forgotten: number[];
  reinforced: number[]; // known facts that came up again and still matter
}

export interface MemoryExtractionResult {
  changes: MemoryChanges;
  usage?: UsageInfo;
}

export const NO_MEMORY_CHANGES: MemoryChanges = { added: [], updated: [], forgotten: [], reinforced: [] };

// The memory list sent to the model, numbered from 1 so its replies can say
// "UPDATE 3" instead of quoting the fact.
const numbered = (facts: string[]) => facts.map((f, i) => `${i + 1}. ${f}`).join("\n");

export const buildMemoryExtractionPrompt = (
  conversationText: string,
  memory: string[],
  pinnedMemory: string[],
  names: { userName?: string; charName?: string } = {}
): string => {
  const user = names.userName || "the user";
  const char = names.charName || "the character";
  const pinnedBlock = pinnedMemory.length > 0
    ? `\nPinned facts (the user locked these - never update or forget them):\n${pinnedMemory.map((f) => `- ${f}`).join("\n")}\n`
    : "";

  return `You are maintaining long-term memory for a roleplay character (${char}) from a conversation with ${user}.
${pinnedBlock}
Known facts, numbered:
${memory.length > 0 ? numbered(memory) : "None yet."}

Recent conversation:
${conversationText}

From the recent conversation only, work out what to change in the known facts. Worth remembering:
- about ${user}: names, preferences, important life details, recurring topics;
- about the relationship: milestones, how it has changed, nicknames, inside jokes;
- about the story: significant events, promises or plans made, secrets revealed, items given or taken, lasting injuries, where things were left.
Skip small talk and anything that only mattered in the moment. Use real names, not "the user" or "the AI". Keep each fact short and self-contained (one line).

Reply with one change per line, using only these forms:
- <new fact>              (something new worth remembering)
UPDATE <number>: <fact>   (a known fact changed - e.g. they moved, a relationship shifted - give the corrected version)
FORGET <number>           (a known fact is no longer true and has no replacement)
STILL TRUE: <numbers>     (known facts that came up again in this conversation and still matter, comma-separated)

Never add a fact that repeats a known or pinned one; update it instead. If nothing changed, reply with exactly NONE.`;
};

// Reads the model's reply back into MemoryChanges, ignoring anything that
// doesn't fit one of the forms (preambles, numbers out of range, pinned
// facts it was told not to touch).
export const parseMemoryChanges = (reply: string, memoryLength: number): MemoryChanges => {
  const text = reply.trim();
  if (!text || /^none\.?$/i.test(text)) return NO_MEMORY_CHANGES;

  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= memoryLength;
  const changes: MemoryChanges = { added: [], updated: [], forgotten: [], reinforced: [] };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim().replace(/^[*_`]+|[*_`]+$/g, "").trim();
    if (!line || /^none\.?$/i.test(line)) continue;

    const update = line.match(/^update\s*#?(\d+)\s*[:\-–]\s*(.+)$/i);
    if (update) {
      const n = Number(update[1]);
      const fact = update[2].trim();
      if (inRange(n) && fact) changes.updated.push({ index: n - 1, text: fact });
      continue;
    }

    const forget = line.match(/^forget\s*#?(\d+)\b/i);
    if (forget) {
      const n = Number(forget[1]);
      if (inRange(n)) changes.forgotten.push(n - 1);
      continue;
    }

    const still = line.match(/^still\s+true\s*:?\s*(.+)$/i);
    if (still) {
      still[1].split(/[,\s]+/).map((s) => Number(s.replace(/^#/, ""))).filter(inRange).forEach((n) => changes.reinforced.push(n - 1));
      continue;
    }

    const fact = line.replace(/^[-*•]\s*/, "").trim();
    if (fact) changes.added.push(fact);
  }
  return changes;
};

// One non-streaming call that asks the model what to add, correct, drop or
// reconfirm in this character's long-term memory, given a slice of recent
// conversation.
export const extractMemoryChanges = async (
  adapter: ChatProviderAdapter,
  config: ProviderRuntimeConfig,
  selectedModel: string,
  conversationText: string,
  memory: string[],
  pinnedMemory: string[],
  names: { userName?: string; charName?: string } = {}
): Promise<MemoryExtractionResult> => {
  const prompt = buildMemoryExtractionPrompt(conversationText, memory, pinnedMemory, names);
  const result = await adapter.generateOnce(prompt, selectedModel, config);
  return { changes: parseMemoryChanges(result.text, memory.length), usage: result.usage };
};

// Normalized form for duplicate checks, so "Mira likes tea." and
// "mira likes tea" count as the same fact.
const normalize = (fact: string) => fact.toLowerCase().replace(/[\s.!]+$/g, "").replace(/\s+/g, " ").trim();

// Applies one extraction pass to the memory list. The list is kept in
// recency order - least recently touched first - so the cap evicts facts
// nobody has mentioned in a while, not merely the oldest ones: a fact that is
// updated or comes up again moves to the end, and new facts join at the end.
// Pinned facts live in a separate list (Character.pinnedMemory /
// Chat.pinnedMemory), are never passed here, and so can't be evicted; new
// facts that duplicate one of them are dropped.
export const applyMemoryChanges = (existing: string[] = [], changes: MemoryChanges, pinnedMemory: string[] = []): string[] => {
  const forgotten = new Set(changes.forgotten);
  const updatedText = new Map(changes.updated.filter((u) => !forgotten.has(u.index)).map((u) => [u.index, u.text]));
  const touched = new Set([...Array.from(updatedText.keys()), ...changes.reinforced.filter((i) => !forgotten.has(i))]);

  const untouched: string[] = [];
  const refreshed: string[] = [];
  existing.forEach((fact, i) => {
    if (forgotten.has(i)) return;
    const text = updatedText.get(i) ?? fact;
    (touched.has(i) ? refreshed : untouched).push(text);
  });

  const merged = [...untouched, ...refreshed];
  const seen = new Set([...merged, ...pinnedMemory].map(normalize));
  for (const fact of changes.added) {
    const key = normalize(fact);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(fact);
  }

  return merged.length > MAX_MEMORY_ENTRIES ? merged.slice(merged.length - MAX_MEMORY_ENTRIES) : merged;
};
