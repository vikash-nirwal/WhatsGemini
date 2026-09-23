import { getInitialMessages } from "./settings";
import { YOU, AI, getModelPricing } from "../../../utils/constants";
import { ChatMessage, UsageInfo } from "../types";
import { ChatProviderAdapter, ProviderRuntimeConfig } from "../providers/types";
import { Message } from "../../../types";
import { formatTranscript, TranscriptNames } from "./transcript";
import { estimateMessageTokens } from "./tokenEstimator";
import { splitForCompression } from "./compressionSplit";

// Pure helpers live in transcript.ts (testable without the provider registry's
// ESM imports) and are re-exported here for existing callers.
export { formatTranscript, splitTrailingUserMessages } from "./transcript";
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
  systemInstruction?: string
): Promise<{ summary: string; usage?: UsageInfo }> => {
  const prompt = `Summarize the following roleplay conversation so it can replace the older messages as the AI's memory. Write it as a compact reference, not a story, using these headings (skip any that don't apply):

Story so far: the key events in order, briefly.
Current scene: where the characters are, the time of day, and what is happening right now.
Characters & relationships: who has appeared, what they're like, and how each feels about the others right now.
Open threads: unresolved goals, promises, secrets, plans, and questions left hanging.
Important details: names, items held, injuries, facts established about the user and the world, and the user's stated preferences.
Style: the language used (e.g. English, Hinglish), tone, narration style (e.g. first/third person, *actions* in asterisks), and the current emotional state of each character.

If the text contains an earlier summary, merge it in rather than repeating it. Use the characters' real names. Do not continue the story or address anyone; output only the summary.

Conversation:
${transcript}`;

  const result = await adapter.generateOnce(prompt, selectedModel, config, systemInstruction);
  return { summary: result.text.trim(), usage: result.usage };
};

// If the chat's message count has grown past compressThresholdMessages,
// summarizes the aged-out portion (excluding any seeded initial messages) into
// a single persisted message pair, collapsing down to half that many recent
// messages kept verbatim (see splitForCompression) rather than pinning right
// at the threshold - that headroom is what stops compression from firing
// again on almost every subsequent turn. If the oldest surviving message is
// already a prior compression summary, it's folded into the new one (via the
// plain-text summarization input) rather than re-summarized alongside it - so
// there's only ever one live summary message.
export const buildAutoCompressedMessages = async (
  adapter: ChatProviderAdapter,
  config: ProviderRuntimeConfig,
  selectedModel: string,
  messages: Message[],
  compressThresholdMessages: number,
  names?: TranscriptNames
): Promise<{ messages: Message[]; compressed: boolean; usage?: UsageInfo; error?: string }> => {
  if (compressThresholdMessages <= 0) return { messages, compressed: false };

  const initialMessages = getInitialMessages();
  const startIndex = initialMessages.length || 0;
  const compressible = messages.slice(startIndex);
  if (compressible.length <= compressThresholdMessages) return { messages, compressed: false };

  const splitIndex = splitForCompression(compressible, compressThresholdMessages);
  if (splitIndex <= 1) return { messages, compressed: false };

  const oldChunk = compressible.slice(0, splitIndex);
  const tail = compressible.slice(splitIndex);

  try {
    const summarizable = oldChunk.filter((m) => !m.isSystem);
    if (summarizable.length === 0) return { messages, compressed: false };

    const { summary, usage } = await summarizeConversation(adapter, config, selectedModel, formatTranscript(summarizable, names));
    if (!summary) return { messages, compressed: false };

    const summaryMsg: Message = {
      role: YOU,
      txt: `Earlier conversation summary (treat as established context, continue naturally):\n\n${summary}`,
      isCompressionSummary: true,
      timestamp: Date.now(),
    };
    const ackMsg: Message = {
      role: AI,
      txt: "Understood, continuing from that context.",
      isSystem: true,
      timestamp: Date.now(),
    };

    return {
      messages: [...messages.slice(0, startIndex), summaryMsg, ackMsg, ...tail],
      compressed: true,
      usage,
    };
  } catch (e) {
    console.warn("Auto-compression failed, continuing with full history.", e);
    return { messages, compressed: false, error: e instanceof Error ? e.message : String(e) };
  }
};

// Hard-caps history to maxHistoryTokens estimated tokens, splicing out the
// oldest non-seeded messages once it's exceeded (used as a backstop alongside/
// instead of compression). Walks backwards from the newest message,
// accumulating estimated tokens, so the messages that survive are always the
// most recent ones that fit - the newest message always stays regardless of
// its own size, so truncation never empties the history entirely.
export const truncateHistory = (validHistory: ChatMessage[], maxHistoryTokens: number): ChatMessage[] => {
  if (maxHistoryTokens <= 0) return validHistory;

  const initialMessages = getInitialMessages();
  const initialMessagesLength = initialMessages.length || 0;
  const startIndex = initialMessagesLength > 0 ? initialMessagesLength : 1;
  if (startIndex >= validHistory.length) return validHistory;

  let tokens = 0;
  let cutoff = startIndex;
  for (let i = validHistory.length - 1; i >= startIndex; i--) {
    const msgTokens = estimateMessageTokens(validHistory[i].text);
    const isNewest = i === validHistory.length - 1;
    if (!isNewest && tokens + msgTokens > maxHistoryTokens) {
      cutoff = i + 1;
      break;
    }
    tokens += msgTokens;
    cutoff = i;
  }

  if (cutoff > startIndex) {
    validHistory.splice(startIndex, cutoff - startIndex);
  }
  return validHistory;
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
