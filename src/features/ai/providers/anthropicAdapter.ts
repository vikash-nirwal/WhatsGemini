import { ChatMessage, UsageInfo } from "../types";
import { ChatCallOptions, ChatCallResult, ChatProviderAdapter, ProviderRuntimeConfig } from "./types";
import { readSseStream } from "./sse";

// Anthropic's Messages API is the only requested provider that isn't OpenAI-Chat-
// Completions-shaped: auth is x-api-key (not Bearer), `system` is a top-level
// field rather than a message, and it requires an explicit opt-in header to be
// called directly from a browser (this app is a pure client-side SPA with no
// backend proxy, so without this header every request looks like a CORS failure).
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

const toAnthropicMessages = (history: ChatMessage[], prompt: string): AnthropicMessage[] => {
  const messages: AnthropicMessage[] = history
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text || " " }));
  messages.push({ role: "user", content: prompt });
  return messages;
};

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

const normalizeUsage = (usage?: AnthropicUsage): UsageInfo | undefined => {
  if (!usage) return undefined;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
};

const extractErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return body?.error?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const messagesCall = async (
  messages: AnthropicMessage[],
  model: string,
  config: ProviderRuntimeConfig,
  extra: { systemInstruction?: string; temperature?: number; maxOutputTokens?: number; signal?: AbortSignal; topK?: number; onToken?: (textSoFar: string) => void }
): Promise<ChatCallResult> => {
  if (!config.apiKey) throw new Error("An Anthropic API key is required.");
  const stream = Boolean(extra.onToken);

  const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      messages,
      system: extra.systemInstruction,
      temperature: extra.temperature,
      max_tokens: extra.maxOutputTokens || 4096,
      // top_k only: Anthropic has no frequency/presence penalties, and newer
      // Claude models reject temperature and top_p set together.
      ...(extra.topK != null ? { top_k: extra.topK } : {}),
      ...(stream ? { stream: true } : {}),
    }),
    signal: extra.signal,
  });

  if (!response.ok) {
    throw new Error(`Anthropic error: ${await extractErrorMessage(response)}`);
  }

  if (stream) {
    let text = "";
    const usage: AnthropicUsage = {};
    await readSseStream(response, (data) => {
      try {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          text += event.delta.text || "";
          extra.onToken?.(text);
        } else if (event.type === "message_start" && event.message?.usage) {
          usage.input_tokens = event.message.usage.input_tokens;
          usage.output_tokens = event.message.usage.output_tokens;
        } else if (event.type === "message_delta" && event.usage) {
          usage.output_tokens = event.usage.output_tokens;
        } else if (event.type === "error") {
          throw new Error(`Anthropic error: ${event.error?.message || "stream error"}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Anthropic error")) throw e;
        console.warn("Could not parse Anthropic stream event:", e);
      }
    }, extra.signal);
    return { text: text.trim(), usage: normalizeUsage(usage) };
  }

  const data = await response.json();
  const text = (data?.content || [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("");

  return { text: text.trim(), usage: normalizeUsage(data?.usage) };
};

const generateChat = (opts: ChatCallOptions, config: ProviderRuntimeConfig): Promise<ChatCallResult> =>
  messagesCall(toAnthropicMessages(opts.history, opts.prompt), opts.model, config, {
    systemInstruction: opts.systemInstruction,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
    signal: opts.signal,
    topK: opts.samplers?.topK,
    onToken: opts.onToken,
  });

const generateOnce = (
  prompt: string,
  model: string,
  config: ProviderRuntimeConfig,
  systemInstruction?: string
): Promise<ChatCallResult> =>
  messagesCall([{ role: "user", content: prompt }], model, config, { systemInstruction });

export const anthropicAdapter: ChatProviderAdapter = {
  id: "anthropic",
  capabilities: { supportsImageGen: false, requiresApiKey: true, requiresBaseUrl: false },
  generateChat,
  generateOnce,
};
