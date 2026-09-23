import { MAX_MEMORY_ENTRIES } from "../../../utils/constants";
import { UsageInfo } from "../types";
import { ChatProviderAdapter, ProviderRuntimeConfig } from "../providers/types";

export interface MemoryExtractionResult {
  facts: string[];
  usage?: UsageInfo;
}

// One non-streaming call that asks the model to distill new, durable facts
// worth remembering long-term from a slice of recent conversation - fed the
// facts already known so it naturally avoids re-extracting duplicates.
export const extractMemoryFacts = async (
  adapter: ChatProviderAdapter,
  config: ProviderRuntimeConfig,
  selectedModel: string,
  conversationText: string,
  existingMemory: string[],
  names: { userName?: string; charName?: string } = {}
): Promise<MemoryExtractionResult> => {
  const user = names.userName || "the user";
  const char = names.charName || "the character";
  const knownFactsBlock = existingMemory.length > 0
    ? existingMemory.map((f) => `- ${f}`).join("\n")
    : "None yet.";

  const prompt = `You are extracting long-term memory for a roleplay character (${char}) from a conversation with ${user}.

Already known facts:
${knownFactsBlock}

Recent conversation:
${conversationText}

From the recent conversation only, extract any NEW facts worth remembering in later conversations:
- about ${user}: names, preferences, important life details, recurring topics;
- about the relationship: milestones, how it has changed, nicknames, inside jokes;
- about the story: significant events, promises or plans made, secrets revealed, items given or taken, lasting injuries, where things were left.
Skip small talk and anything that only mattered in the moment. Use real names, not "the user" or "the AI". Keep each fact short and self-contained (one line). If a new fact updates or contradicts a known one, state the new version. Do not repeat anything already known above. If there is nothing new worth remembering, reply with exactly NONE.

Reply with only the new facts, one per line, each starting with "- ". If nothing new, reply with exactly NONE.`;

  const result = await adapter.generateOnce(prompt, selectedModel, config);
  const text = result.text.trim();

  if (!text || text.toUpperCase() === "NONE") {
    return { facts: [], usage: result.usage };
  }

  const facts = text
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  return { facts, usage: result.usage };
};

// Appends new facts (skipping exact duplicates), trimming the oldest entries
// once the list exceeds the cap. Pinned facts live in a separate list
// (Character.pinnedMemory / Chat.pinnedMemory) and are never passed here, so
// they can't be evicted.
export const mergeMemory = (existing: string[] = [], newFacts: string[]): string[] => {
  const merged = [...existing, ...newFacts.filter((f) => !existing.includes(f))];
  return merged.length > MAX_MEMORY_ENTRIES ? merged.slice(merged.length - MAX_MEMORY_ENTRIES) : merged;
};
