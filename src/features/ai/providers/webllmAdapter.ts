import { ChatMessage, UsageInfo } from "../types";
import { PROVIDER_CHAT_MODELS } from "../../../utils/constants";
import { loadWebLLM, WebLLMEngine } from "./webllmLoader";
import { ChatCallOptions, ChatCallResult, ChatProviderAdapter, ProviderRuntimeConfig } from "./types";

// A free model that runs in the browser on the user's own GPU (#55), through
// WebLLM: no key, no server, no cost. The library (see webllmLoader.ts) and
// the model (about 1-2 GB, cached by the browser after the first time) load
// only when this provider is actually used, so nobody else downloads them.

export const WEBLLM_MODELS = PROVIDER_CHAT_MODELS.webllm;

// ---- Download progress, for the toast that shows it (WebLLMProgress.tsx) ----

export interface WebLLMProgress {
  model: string;
  progress: number; // 0-1
  text: string;
  done: boolean;
}
type Listener = (p: WebLLMProgress) => void;
const listeners = new Set<Listener>();
export const onWebLLMProgress = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const emit = (p: WebLLMProgress) => listeners.forEach((l) => l(p));

// ---- The engine ----

export class NoWebGPUError extends Error {
  constructor() {
    super("This browser can't run a model locally: it needs WebGPU (recent Chrome or Edge on a computer with a GPU). Pick another provider in Settings > Text.");
  }
}

export const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator && Boolean((navigator as any).gpu);

// The API can be there with no usable GPU behind it (headless browsers, some
// VMs), so ask for an adapter before downloading anything.
export const checkWebGPU = async (): Promise<boolean> => {
  if (!hasWebGPU()) return false;
  try {
    return Boolean(await (navigator as any).gpu.requestAdapter());
  } catch {
    return false;
  }
};

// One engine, reloaded only when the model changes; loading takes a while.
let engine: { model: string; ready: Promise<WebLLMEngine> } | null = null;

const getEngine = (model: string): Promise<WebLLMEngine> => {
  if (!hasWebGPU()) return Promise.reject(new NoWebGPUError());
  if (engine?.model === model) return engine.ready;
  const ready = (async () => {
    if (!(await checkWebGPU())) throw new NoWebGPUError();
    const webllm = await loadWebLLM();
    emit({ model, progress: 0, text: "Starting...", done: false });
    const created = await webllm.CreateMLCEngine(model, {
      initProgressCallback: (r) => emit({ model, progress: r.progress, text: r.text, done: r.progress >= 1 }),
    });
    emit({ model, progress: 1, text: "Ready", done: true });
    return created;
  })();
  engine = { model, ready };
  // A failed load shouldn't stick: the next call tries again.
  ready.catch(() => {
    if (engine?.ready === ready) engine = null;
    emit({ model, progress: 0, text: "Failed", done: true });
  });
  return ready;
};

type Msg = { role: "system" | "user" | "assistant"; content: string };

const toMessages = (history: ChatMessage[], prompt: string, systemInstruction?: string): Msg[] => [
  ...(systemInstruction ? [{ role: "system" as const, content: systemInstruction }] : []),
  ...history.filter((m) => m.role !== "system").map((m): Msg => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text || " " })),
  { role: "user", content: prompt },
];

const toUsage = (u: any): UsageInfo | undefined =>
  u ? { inputTokens: u.prompt_tokens || 0, outputTokens: u.completion_tokens || 0, totalTokens: u.total_tokens || (u.prompt_tokens || 0) + (u.completion_tokens || 0) } : undefined;

const complete = async (model: string, messages: Msg[], opts: Pick<ChatCallOptions, "temperature" | "maxOutputTokens" | "samplers" | "signal" | "onToken">): Promise<ChatCallResult> => {
  const llm = await getEngine(model);
  const params = {
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxOutputTokens,
    top_p: opts.samplers?.topP,
    frequency_penalty: opts.samplers?.frequencyPenalty,
    presence_penalty: opts.samplers?.presencePenalty,
  };
  // WebLLM can't take an AbortSignal; stopping interrupts the generation.
  const onAbort = () => llm.interruptGenerate();
  opts.signal?.addEventListener("abort", onAbort);
  try {
    if (opts.onToken) {
      const stream = await llm.chat.completions.create({ ...params, stream: true, stream_options: { include_usage: true } });
      let text = "";
      let usage: any;
      for await (const chunk of stream as AsyncIterable<any>) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          opts.onToken(text);
        }
        if (chunk.usage) usage = chunk.usage;
      }
      return { text, usage: toUsage(usage) };
    }
    const reply: any = await llm.chat.completions.create({ ...params, stream: false });
    return { text: reply.choices?.[0]?.message?.content || "", usage: toUsage(reply.usage) };
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
};

export const webllmAdapter: ChatProviderAdapter = {
  id: "webllm",
  capabilities: { supportsImageGen: false, requiresApiKey: false, requiresBaseUrl: false },
  generateChat: (opts: ChatCallOptions, _config: ProviderRuntimeConfig) =>
    complete(opts.model || WEBLLM_MODELS[0], toMessages(opts.history, opts.prompt, opts.systemInstruction), opts),
  generateOnce: (prompt: string, model: string, _config: ProviderRuntimeConfig, systemInstruction?: string) =>
    complete(model || WEBLLM_MODELS[0], toMessages([], prompt, systemInstruction), {}).then((r) => ({ ...r, text: r.text.trim() })),
};

// For tests: forget the loaded engine.
export const resetWebLLMEngine = () => {
  engine = null;
};
