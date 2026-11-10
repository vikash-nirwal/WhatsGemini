import { ChatMessage, NormalizedImage, UsageInfo } from "../types";
import { ChatCallOptions, ChatCallResult, ChatProviderAdapter, ContentBlockedError, ProviderRuntimeConfig, WebLookupRequest, WebLookupResult, cleanLookupText, webLookupPrompt } from "./types";
import { readSseStream } from "./sse";

// Anthropic's Messages API is the only requested provider that isn't OpenAI-Chat-
// Completions-shaped: auth is x-api-key (not Bearer), `system` is a top-level
// field rather than a message, and it requires an explicit opt-in header to be
// called directly from a browser (this app is a pure client-side SPA with no
// backend proxy, so without this header every request looks like a CORS failure).
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicBlock = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

const toAnthropicMessages = (history: ChatMessage[], prompt: string, images?: NormalizedImage[]): AnthropicMessage[] => {
  const messages: AnthropicMessage[] = history
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text || " " }));
  // Attached photos (#48) go first in the last turn, as Anthropic recommends.
  messages.push({
    role: "user",
    content: images && images.length > 0
      ? [...images.map((img): AnthropicBlock => ({ type: "image", source: { type: "base64", media_type: img.mimeType, data: img.data } })), { type: "text", text: prompt }]
      : prompt,
  });
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
    let stopReason: string | undefined;
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
        } else if (event.type === "message_delta") {
          if (event.usage) usage.output_tokens = event.usage.output_tokens;
          if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        } else if (event.type === "error") {
          throw new Error(`Anthropic error: ${event.error?.message || "stream error"}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Anthropic error")) throw e;
        console.warn("Could not parse Anthropic stream event:", e);
      }
    }, extra.signal);
    // "refusal" is the stop reason Claude's own safety classifiers report.
    if (stopReason === "refusal" && !text.trim()) throw new ContentBlockedError("Anthropic", "refusal");
    return { text: text.trim(), usage: normalizeUsage(usage) };
  }

  const data = await response.json();
  const text = (data?.content || [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("");

  if (data?.stop_reason === "refusal" && !text.trim()) throw new ContentBlockedError("Anthropic", "refusal");
  return { text: text.trim(), usage: normalizeUsage(data?.usage) };
};

const generateChat = (opts: ChatCallOptions, config: ProviderRuntimeConfig): Promise<ChatCallResult> =>
  messagesCall(toAnthropicMessages(opts.history, opts.prompt, opts.promptImages), opts.model, config, {
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

// Web lookup and link reading (#270, #271): Claude's web search and web
// fetch tools, which Anthropic runs. Newer models take the 2026 versions;
// older ones answer 400 to those, so the basic versions are tried next.
const WEB_TOOLS = {
  search: ["web_search_20260209", "web_search_20250305"],
  open: ["web_fetch_20260209", "web_fetch_20250910"],
} as const;
const LOOKUP_MAX_TOKENS = 2048;
// A long search can pause the turn; it's sent back to carry on, a few times.
const MAX_RESUMES = 3;

interface LookupBlock {
  type: string;
  text?: string;
  content?: unknown;
}

export const lookupSources = (blocks: LookupBlock[]): { title?: string; url: string }[] => {
  const sources: { title?: string; url: string }[] = [];
  for (const block of blocks) {
    // A failed search carries an error object here, not a list.
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const hit of block.content as { type?: string; url?: string; title?: string }[]) {
      if (hit?.type === "web_search_result" && hit.url && !sources.some((s) => s.url === hit.url)) sources.push({ url: hit.url, title: hit.title });
    }
  }
  return sources;
};

const webLookup = async (request: WebLookupRequest, model: string, config: ProviderRuntimeConfig): Promise<WebLookupResult> => {
  if (!config.apiKey) throw new Error("An Anthropic API key is required.");
  const apiKey = config.apiKey;
  const call = (tool: string, messages: unknown[]) =>
    fetch(`${ANTHROPIC_BASE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION, "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({
        model,
        max_tokens: LOOKUP_MAX_TOKENS,
        messages,
        tools: [request.kind === "search" ? { type: tool, name: "web_search", max_uses: 3 } : { type: tool, name: "web_fetch", max_uses: 1, max_content_tokens: 8000 }],
      }),
      signal: request.signal,
    });

  const messages: unknown[] = [{ role: "user", content: webLookupPrompt(request) }];
  const blocks: LookupBlock[] = [];
  const usage: AnthropicUsage = { input_tokens: 0, output_tokens: 0 };
  let tool: string = WEB_TOOLS[request.kind][0];
  for (let turn = 0; turn <= MAX_RESUMES; turn++) {
    let response = await call(tool, messages);
    if (response.status === 400 && turn === 0) {
      tool = WEB_TOOLS[request.kind][1];
      response = await call(tool, messages);
    }
    if (!response.ok) throw new Error(`Anthropic error: ${await extractErrorMessage(response)}`);
    const data = await response.json();
    const content = (data?.content || []) as LookupBlock[];
    blocks.push(...content);
    usage.input_tokens = (usage.input_tokens || 0) + (data?.usage?.input_tokens || 0);
    usage.output_tokens = (usage.output_tokens || 0) + (data?.usage?.output_tokens || 0);
    if (data?.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content });
  }
  // The answer is the text after the last tool result: what comes before
  // is Claude saying what it's about to look up.
  const lastResult = blocks.map((b) => b.type).lastIndexOf(request.kind === "search" ? "web_search_tool_result" : "web_fetch_tool_result");
  const text = blocks.slice(lastResult + 1).filter((b) => b.type === "text").map((b) => b.text || "").join("");
  const sources = lookupSources(blocks);
  return { text: cleanLookupText(text), sources: sources.length > 0 ? sources : undefined, usage: normalizeUsage(usage) };
};

export const anthropicAdapter: ChatProviderAdapter = {
  id: "anthropic",
  capabilities: { supportsImageGen: false, requiresApiKey: true, requiresBaseUrl: false },
  generateChat,
  generateOnce,
  webLookup,
};
