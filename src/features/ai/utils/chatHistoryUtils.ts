import { getStoredValue, getInitialMessages, getProviderApiKey, getOllamaBaseUrl } from "./settings";
import { LS_CHAT_PROVIDER, DEFAULT_CHAT_PROVIDER, LS_AI_MODEL, DEFAULT_AI_MODEL, YOU, AI } from "../../../utils/constants";
import { ChatMessage, UsageInfo } from "../types";
import { ChatProviderAdapter, ProviderRuntimeConfig } from "../providers/types";
import { CHAT_PROVIDERS } from "../providers/registry";
import { Message } from "../../../types";
import { buildChatHistory } from "./promptComposition";
import { estimateMessageTokens } from "./tokenEstimator";

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
// and manual (Compress button) compression paths - previously these had two
// separate, divergent prompts doing the same job. Standardized on the more
// thorough of the two: explicitly retains language/tone/emotional state so
// the AI can resume seamlessly, not just facts.
export const summarizeConversation = async (
  adapter: ChatProviderAdapter,
  config: ProviderRuntimeConfig,
  selectedModel: string,
  messages: ChatMessage[],
  systemInstruction?: string
): Promise<{ summary: string; usage?: UsageInfo }> => {
  const conversationText = messages
    .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.text || ""}`)
    .join("\n\n");

  const prompt = `Please provide a concise but comprehensive summary of the following conversation history.
Retain all key facts, user preferences, important context, the language used (e.g., Hinglish, English), the tone, and the current emotional state of both the User and the AI. This summary will act as the AI's memory replacing the older messages.
Do not act as a conversational partner, just provide the summary directly. Ensure you explicitly note the language format, tone, and emotional context so the AI can seamlessly resume in the exact same style and mood.

Conversation:
${conversationText}`;

  const result = await adapter.generateOnce(prompt, selectedModel, config, systemInstruction);
  return { summary: result.text.trim(), usage: result.usage };
};

// If the chat's estimated token count has grown past compressThresholdTokens,
// summarizes the aged-out portion (excluding any seeded initial messages) into
// a single persisted message pair, keeping just under the token budget's worth
// of recent messages verbatim so the result stays pinned near the configured
// budget instead of collapsing to half of it. If the oldest surviving message
// is already a prior compression summary, it's folded into the new one (via
// the plain-text summarization input) rather than re-summarized alongside it -
// so there's only ever one live summary message.
export const buildAutoCompressedMessages = async (
  adapter: ChatProviderAdapter,
  config: ProviderRuntimeConfig,
  selectedModel: string,
  messages: Message[],
  compressThresholdTokens: number
): Promise<{ messages: Message[]; compressed: boolean; usage?: UsageInfo }> => {
  if (compressThresholdTokens <= 0) return { messages, compressed: false };

  const initialMessages = getInitialMessages();
  const startIndex = initialMessages.length || 0;
  const compressible = messages.slice(startIndex);
  if (compressible.length === 0) return { messages, compressed: false };

  const totalTokens = compressible.reduce((sum, m) => sum + estimateMessageTokens(m.txt), 0);
  if (totalTokens <= compressThresholdTokens) return { messages, compressed: false };

  // Walk backwards from the newest message, accumulating tokens, to find how
  // many of the most recent messages fit within the budget - those stay
  // verbatim as `tail`; everything older gets folded into the summary. The
  // newest message always stays regardless of size, so there's always
  // something left to keep the conversation going.
  let tailTokens = 0;
  let splitIndex = compressible.length;
  for (let i = compressible.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessageTokens(compressible[i].txt);
    const isNewest = i === compressible.length - 1;
    if (!isNewest && tailTokens + msgTokens > compressThresholdTokens) {
      splitIndex = i + 1;
      break;
    }
    tailTokens += msgTokens;
    splitIndex = i;
  }

  if (splitIndex <= 1) return { messages, compressed: false };

  const oldChunk = compressible.slice(0, splitIndex);
  const tail = compressible.slice(splitIndex);

  try {
    const summarizable = oldChunk.filter((m) => !m.isSystem);
    if (summarizable.length === 0) return { messages, compressed: false };

    const { summary, usage } = await summarizeConversation(adapter, config, selectedModel, buildChatHistory(summarizable));
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
    return { messages, compressed: false };
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

// Most providers require (or strongly prefer) history to end on an assistant
// turn - drop any trailing unanswered user messages before sending it as context.
export const trimTrailingUserMessages = (validHistory: ChatMessage[]): ChatMessage[] => {
  while (validHistory.length > 0 && validHistory[validHistory.length - 1].role === "user") {
    validHistory.pop();
  }
  return validHistory;
};

export const performChatCompression = async (history: ChatMessage[], systemInstruction?: string): Promise<string> => {
  const providerId = getStoredValue(LS_CHAT_PROVIDER, DEFAULT_CHAT_PROVIDER);
  const adapter = CHAT_PROVIDERS[providerId] || CHAT_PROVIDERS[DEFAULT_CHAT_PROVIDER];

  const apiKey = await getProviderApiKey(providerId);
  if (!apiKey && adapter.capabilities.requiresApiKey) {
    throw new Error("API key is missing. Please log in.");
  }
  const baseUrl = adapter.capabilities.requiresBaseUrl ? getOllamaBaseUrl() : undefined;
  const selectedModel = getStoredValue(LS_AI_MODEL, DEFAULT_AI_MODEL);

  const { summary } = await summarizeConversation(adapter, { apiKey, baseUrl }, selectedModel, history, systemInstruction);
  return summary;
};
