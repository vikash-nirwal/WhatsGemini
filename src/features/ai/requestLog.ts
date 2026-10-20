import { SamplerSettings } from "../../types";
import { ChatMessage, UsageInfo } from "./types";
import { ChatProviderAdapter } from "./providers/types";

// An in-memory record of the last few calls to a chat provider (#31, the
// prompt inspector). It is filled by the wrapper in providers/registry.ts, so
// every caller (chat turns, compression, memory, image-prompt derivation) is
// recorded without having to know about it. Nothing is persisted: a reload
// clears it, which keeps full prompts out of IndexedDB and backups.

export const REQUEST_LOG_LIMIT = 20;

// "chat" = generateChat (threaded history, used for replies and image-prompt
// derivation); "once" = generateOnce (summaries, memory, greetings).
export type RequestKind = "chat" | "once";

export interface LoggedRequest {
  id: string;
  kind: RequestKind;
  startedAt: number;
  finishedAt?: number;
  provider: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  samplers?: SamplerSettings;
  systemInstruction?: string;
  // The history and final prompt exactly as handed to the adapter. Each
  // adapter then maps them to its own wire format (roles, a top-level
  // `system` field) without changing the text.
  history: ChatMessage[];
  prompt: string;
  status: "pending" | "done" | "error";
  response?: string;
  usage?: UsageInfo;
  error?: string;
}

type Listener = (entries: LoggedRequest[]) => void;

let entries: LoggedRequest[] = [];
const listeners = new Set<Listener>();
let counter = 0;

const emit = () => {
  for (const listener of listeners) listener(entries);
};

// Newest first. The array is replaced on every change, so it can be used
// directly as React state (useSyncExternalStore compares by identity).
export const getRequestLog = (): LoggedRequest[] => entries;

export const getRequest = (id: string): LoggedRequest | undefined => entries.find((e) => e.id === id);

export const subscribeRequestLog = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const clearRequestLog = () => {
  entries = [];
  emit();
};

export type NewRequest = Omit<LoggedRequest, "id" | "startedAt" | "status">;

// Records a call as pending and returns its id, to be finished with
// completeRequest or failRequest once the provider answers.
export const startRequest = (request: NewRequest, now: number = Date.now()): string => {
  counter += 1;
  const id = `req-${now}-${counter}`;
  // Copied so a caller that later mutates its history array doesn't rewrite
  // what the inspector shows was sent.
  const entry: LoggedRequest = {
    ...request,
    history: request.history.map((m) => ({ ...m })),
    samplers: request.samplers ? { ...request.samplers } : undefined,
    id,
    startedAt: now,
    status: "pending",
  };
  entries = [entry, ...entries].slice(0, REQUEST_LOG_LIMIT);
  emit();
  return id;
};

const patch = (id: string, change: Partial<LoggedRequest>) => {
  if (!entries.some((e) => e.id === id)) return; // already pushed out of the log
  entries = entries.map((e) => (e.id === id ? { ...e, ...change } : e));
  emit();
};

export const completeRequest = (id: string, response: string, usage?: UsageInfo, now: number = Date.now()) =>
  patch(id, { status: "done", response, usage, finishedAt: now });

export const failRequest = (id: string, error: unknown, now: number = Date.now()) =>
  patch(id, { status: "error", error: error instanceof Error ? error.message : String(error), finishedAt: now });

// Finds the request that produced a stored reply, for a "Show what was sent"
// action on a message. The app stores the reply after small changes (an
// emotion tag stripped, images moved out, whitespace trimmed), so an exact
// match is tried first, then a reply the provider's text contains. Chat calls
// are searched before "once" calls, since the only bubble a generateOnce call
// produces is a generated greeting.
export const findRequestForReply = (replyText: string): LoggedRequest | undefined => {
  const reply = replyText.trim();
  if (!reply) return undefined;
  const done = entries.filter((e) => e.status === "done" && e.response);
  const byKind = (kind: RequestKind) => done.filter((e) => e.kind === kind);
  const probe = reply.slice(0, 200);
  for (const pool of [byKind("chat"), byKind("once")]) {
    const exact = pool.find((e) => e.response!.trim() === reply);
    if (exact) return exact;
    const partial = pool.find((e) => e.response!.includes(probe));
    if (partial) return partial;
  }
  return undefined;
};

// Wraps an adapter so every call is recorded with exactly what was handed to
// the provider and what came back. registry.ts wraps every chat adapter, so a
// new call site can't forget to record.
export const withRequestLog = (adapter: ChatProviderAdapter): ChatProviderAdapter => ({
  ...adapter,
  generateChat: async (opts, config) => {
    const id = startRequest({
      kind: "chat",
      provider: adapter.id,
      model: opts.model,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      samplers: opts.samplers,
      systemInstruction: opts.systemInstruction,
      history: opts.history,
      prompt: opts.prompt,
    });
    try {
      const result = await adapter.generateChat(opts, config);
      completeRequest(id, result.text, result.usage);
      return result;
    } catch (e) {
      failRequest(id, e);
      throw e;
    }
  },
  generateOnce: async (prompt, model, config, systemInstruction) => {
    const id = startRequest({ kind: "once", provider: adapter.id, model, systemInstruction, history: [], prompt });
    try {
      const result = await adapter.generateOnce(prompt, model, config, systemInstruction);
      completeRequest(id, result.text, result.usage);
      return result;
    } catch (e) {
      failRequest(id, e);
      throw e;
    }
  },
});
