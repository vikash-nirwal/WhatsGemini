import { tagPurpose } from "../../spending/tokenUsage";
import { getModelPricing } from "../../../utils/constants";
import { ChatMessage, UsageInfo } from "../types";
import { ChatProviderAdapter, ProviderRuntimeConfig } from "../providers/types";
import { Message } from "../../../types";
import { formatTranscript, TranscriptNames, countSeedMessages, latestSummaryIndex, buildSummaryMessages } from "./transcript";
import { foldSplit } from "./compressionSplit";
import { estimateTokens } from "./tokenEstimator";

// Pure helpers live in transcript.ts (testable without the provider registry's
// ESM imports) and are re-exported here for existing callers.
export { formatTranscript, splitTrailingUserMessages, truncateHistory, countSeedMessages, countProtectedPrefix, latestSummaryIndex, trimToLatestSummary, buildSummaryMessages, parseChapterReply, CHAPTER_INSTRUCTIONS } from "./transcript";
export type { TranscriptNames } from "./transcript";

// Clones the raw history into fresh objects and drops the trailing user
// message if it's a duplicate of the prompt about to be sent (the caller's chat
// state often already contains it).
export const buildValidHistory = (history: ChatMessage[], prompt: string): ChatMessage[] => {
  const validHistory: ChatMessage[] = history
    .filter((msg) => msg?.text && msg.role)
    .map((msg) => ({ ...msg }));

  const last = validHistory[validHistory.length - 1];
  if (last && last.role === "user" && last.text === prompt) {
    validHistory.pop();
  }

  return validHistory;
};

// Shared summarization prompt used by both the automatic (threshold-triggered)
// and manual (Compress button) compression paths. Written for roleplay
// continuity: besides the language/tone/mood it always kept, it asks for the
// concrete story state (where everyone is, what's happening, open threads,
// promises, items, injuries) that a free-form "summary" tended to lose.
export const summarizeConversation = async (
  adapter: ChatProviderAdapter,
  config: ProviderRuntimeConfig,
  selectedModel: string,
  transcript: string,
  systemInstruction?: string,
  extraInstructions?: string
): Promise<{ summary: string; usage?: UsageInfo }> => {
  const prompt = `${extraInstructions ? `${extraInstructions}\n\n` : ""}Summarize the following roleplay conversation so it can replace the older messages as the AI's memory. Write it as a compact reference, not a story, using these headings (skip any that don't apply):

Story so far: the key events in order, briefly.
Current scene: where the characters are, the time of day, and what is happening right now.
Characters & relationships: who has appeared, what they're like, and how each feels about the others right now.
Open threads: unresolved goals, promises, secrets, plans, and questions left hanging.
Important details: names, items held, injuries, facts established about the user and the world, and the user's stated preferences.
Style: the language used (e.g. English, Hinglish), tone, narration style (e.g. first/third person, *actions* in asterisks), and the current emotional state of each character.

Keep the details: exact names and nicknames, numbers, dates and times, places, promises and plans with when they're due, gifts, inside jokes, and everything the user said about themselves, their life, likes and dislikes. If you're unsure whether a detail matters, keep it. Leave out only small talk and repetition. Be as long as the story needs.

If the text contains an earlier summary, merge it in rather than repeating it, carrying over every detail from it that's still true. Use the characters' real names. Do not continue the story or address anyone; output only the summary.

Conversation:
${transcript}`;

  tagPurpose("summary");
  const result = await adapter.generateOnce(prompt, selectedModel, config, systemInstruction);
  return { summary: result.text.trim(), usage: result.usage };
};

// If the part of the chat the model still sees (the seed, then everything
// from the latest summary on - see trimToLatestSummary) has grown past
// compressThresholdMessages, summarizes its older portion, keeping half that
// many recent messages verbatim (see splitForCompression) rather than pinning
// right at the threshold - that headroom is what stops compression from
// firing again on almost every subsequent turn. A previous summary at the
// start of that window is folded into the new one rather than re-summarized
// alongside it.
//
// Nothing is removed. The result says where the new summary pair goes: right
// after `messages[afterIndex]`, the last message it covers. The caller
// splices it into the conversation tree there (insertCompressionSummary), so
// every message and branch stays readable and the prompt simply starts from
// the newest summary.
export const buildAutoCompressedMessages = async (
  adapter: ChatProviderAdapter,
  config: ProviderRuntimeConfig,
  selectedModel: string,
  messages: Message[],
  compressThresholdMessages: number,
  names?: TranscriptNames,
  // By size (2026-10-30): the newest this many tokens stay word for word.
  keepTokens = 0
): Promise<{ compressed: boolean; summaryMessages?: Message[]; afterIndex?: number; usage?: UsageInfo; error?: string }> => {
  if (compressThresholdMessages <= 0 && keepTokens <= 0) return { compressed: false };

  const latest = latestSummaryIndex(messages);
  const windowStart = latest >= 0 ? latest : countSeedMessages(messages);
  const compressible = messages.slice(windowStart);
  const splitIndex = foldSplit(compressible, compressThresholdMessages, keepTokens, (m) => estimateTokens(m.txt));
  if (!splitIndex) return { compressed: false };

  const oldChunk = compressible.slice(0, splitIndex);

  try {
    const summarizable = oldChunk.filter((m) => !m.isSystem);
    if (summarizable.length === 0) return { compressed: false };

    const { summary, usage } = await summarizeConversation(adapter, config, selectedModel, formatTranscript(summarizable, names));
    if (!summary) return { compressed: false };

    const last = oldChunk[oldChunk.length - 1];
    return {
      compressed: true,
      summaryMessages: buildSummaryMessages(summary, last.timestamp),
      afterIndex: windowStart + splitIndex - 1,
      usage,
    };
  } catch (e) {
    console.warn("Auto-compression failed, continuing with full history.", e);
    return { compressed: false, error: e instanceof Error ? e.message : String(e) };
  }
};

// Returns the summary text plus this call's own real usage/cost (priced off
// the same provider/model that served it) so the manual "Compress" button's
// spend can be folded into the chat's running total instead of being dropped.
export const performChatCompression = async (
  adapter: ChatProviderAdapter,
  config: ProviderRuntimeConfig,
  providerId: string,
  selectedModel: string,
  transcript: string,
  systemInstruction?: string
): Promise<{ summary: string; tokens: number; cost: number }> => {
  const { summary, usage } = await summarizeConversation(adapter, config, selectedModel, transcript, systemInstruction);
  const pricing = getModelPricing(providerId, selectedModel);
  const tokens = usage?.totalTokens || 0;
  const cost = usage ? (usage.inputTokens / 1_000_000) * pricing.input + (usage.outputTokens / 1_000_000) * pricing.output : 0;
  return { summary, tokens, cost };
};
