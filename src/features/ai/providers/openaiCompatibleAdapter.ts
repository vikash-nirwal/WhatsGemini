import { SamplerSettings } from "../../../types";
import { ChatMessage, UsageInfo } from "../types";
import { ChatCallOptions, ChatCallResult, ChatProviderAdapter, ModelOption, ProviderRuntimeConfig } from "./types";
import { readSseStream } from "./sse";

// `top_k` isn't part of OpenAI's own API (it rejects unknown params), but
// these OpenAI-compatible backends accept it.
const ACCEPTS_TOP_K = new Set(["ollama", "qwen"]);
// Providers documented to honor `stream_options.include_usage` - the only way
// a streamed Chat Completions response reports token usage. Others may still
// send usage on their final chunk unprompted, which is picked up either way.
const ACCEPTS_STREAM_USAGE = new Set(["openai", "deepseek", "qwen"]);

const samplerParams = (def: OpenAiCompatibleProviderDef, samplers?: SamplerSettings): Record<string, number> => {
  const params: Record<string, number> = {};
  if (!samplers) return params;
  if (samplers.topP != null) params.top_p = samplers.topP;
  if (samplers.topK != null && ACCEPTS_TOP_K.has(def.id)) params.top_k = samplers.topK;
  if (samplers.frequencyPenalty) params.frequency_penalty = samplers.frequencyPenalty;
  if (samplers.presencePenalty) params.presence_penalty = samplers.presencePenalty;
  return params;
};

// Covers every provider that speaks OpenAI's Chat Completions wire format:
// OpenAI itself, DeepSeek, Qwen (via DashScope's compatible-mode endpoint),
// Kimi/Moonshot, and Ollama (via its /v1 endpoint). One factory, parameterized
// by base URL / auth / whether a key is required, replaces five bespoke adapters.
export interface OpenAiCompatibleProviderDef {
  id: string;
  label: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
}

interface OpenAiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const toOpenAiRole = (role: ChatMessage["role"]): "system" | "user" | "assistant" =>
  role === "assistant" ? "assistant" : role === "system" ? "system" : "user";

const toOpenAiMessages = (opts: ChatCallOptions): OpenAiChatMessage[] => {
  const messages: OpenAiChatMessage[] = [];
  if (opts.systemInstruction) messages.push({ role: "system", content: opts.systemInstruction });
  for (const m of opts.history) {
    messages.push({ role: toOpenAiRole(m.role), content: m.text || " " });
  }
  messages.push({ role: "user", content: opts.prompt });
  return messages;
};

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

const normalizeUsage = (usage?: OpenAiUsage): UsageInfo | undefined => {
  if (!usage) return undefined;
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  return { inputTokens, outputTokens, totalTokens: usage.total_tokens || inputTokens + outputTokens };
};

const buildHeaders = (def: OpenAiCompatibleProviderDef, apiKey?: string | null): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  return headers;
};

const extractErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return body?.error?.message || body?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const chatCompletions = async (
  def: OpenAiCompatibleProviderDef,
  messages: OpenAiChatMessage[],
  model: string,
  config: ProviderRuntimeConfig,
  extra: { temperature?: number; maxOutputTokens?: number; signal?: AbortSignal; samplers?: SamplerSettings; onToken?: (textSoFar: string) => void }
): Promise<ChatCallResult> => {
  if (def.requiresApiKey && !config.apiKey) {
    throw new Error(`An API key is required for ${def.label}.`);
  }

  const stream = Boolean(extra.onToken);
  const baseUrl = (config.baseUrl || def.defaultBaseUrl).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(def, config.apiKey),
    body: JSON.stringify({
      model,
      messages,
      temperature: extra.temperature,
      max_tokens: extra.maxOutputTokens,
      ...samplerParams(def, extra.samplers),
      stream,
      ...(stream && ACCEPTS_STREAM_USAGE.has(def.id) ? { stream_options: { include_usage: true } } : {}),
    }),
    signal: extra.signal,
  });

  if (!response.ok) {
    throw new Error(`${def.label} error: ${await extractErrorMessage(response)}`);
  }

  if (stream) {
    let text = "";
    let usage: OpenAiUsage | undefined;
    await readSseStream(response, (data) => {
      try {
        const chunk = JSON.parse(data);
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          text += delta;
          extra.onToken?.(text);
        }
        if (chunk?.usage) usage = chunk.usage;
      } catch (e) {
        console.warn(`Could not parse ${def.label} stream chunk:`, e);
      }
    }, extra.signal);
    return { text: text.trim(), usage: normalizeUsage(usage) };
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return { text: text.trim(), usage: normalizeUsage(data?.usage) };
};

// GET .../models is the one part of the OpenAI wire format DeepSeek, Qwen and
// Kimi all implement identically (`{ data: [{ id: "..." }, ...] }`), so this
// generic call gives every provider built from this factory a live model
// list for free - same idea as Gemini's models.list fetch in SettingsPage,
// just against the OpenAI-shaped endpoint instead of Google's.
const listModels = async (def: OpenAiCompatibleProviderDef, config: ProviderRuntimeConfig): Promise<ModelOption[]> => {
  if (def.requiresApiKey && !config.apiKey) {
    throw new Error(`An API key is required for ${def.label}.`);
  }

  const baseUrl = (config.baseUrl || def.defaultBaseUrl).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/models`, { headers: buildHeaders(def, config.apiKey) });
  if (!response.ok) {
    throw new Error(`${def.label} error: ${await extractErrorMessage(response)}`);
  }

  const data = await response.json();
  const list: any[] = data?.data || [];
  return list
    .map((m) => ({ value: m.id as string, label: m.id as string }))
    .filter((m) => !!m.value)
    .sort((a, b) => a.value.localeCompare(b.value));
};

export const createOpenAiCompatibleAdapter = (def: OpenAiCompatibleProviderDef): ChatProviderAdapter => ({
  id: def.id,
  capabilities: { supportsImageGen: false, requiresApiKey: def.requiresApiKey, requiresBaseUrl: def.id === "ollama" },
  generateChat: (opts, config) =>
    chatCompletions(def, toOpenAiMessages(opts), opts.model, config, {
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      signal: opts.signal,
      samplers: opts.samplers,
      onToken: opts.onToken,
    }),
  generateOnce: (prompt, model, config, systemInstruction) => {
    const messages: OpenAiChatMessage[] = [];
    if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
    messages.push({ role: "user", content: prompt });
    return chatCompletions(def, messages, model, config, {});
  },
  listModels: (config) => listModels(def, config),
});
