import { AISafetySettings } from "../../../types";
import { ChatMessage, NormalizedImage, UsageInfo } from "../types";

// Capability flags let Settings UI hide/disable controls a given provider can't
// actually honor (e.g. Gemini-only safety settings, Ollama's keyless local host).
export interface ProviderCapabilities {
  supportsImageGen: boolean;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean; // true only for local/self-hosted backends (Ollama)
}

export interface ProviderRuntimeConfig {
  apiKey?: string | null;
  baseUrl?: string;
}

export interface ChatCallOptions {
  model: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  history: ChatMessage[];
  prompt: string;
  signal?: AbortSignal;
  safetySettings?: AISafetySettings; // only honored by adapters that support it (Gemini)
}

export interface ChatCallResult {
  text: string;
  usage?: UsageInfo;
}

export interface ImageGenCallOptions {
  model: string;
  prompt: string;
  referenceImages?: NormalizedImage[];
  signal?: AbortSignal;
  safetySettings?: AISafetySettings;
  // Gemini-only for now (Gemini 3.x image models' `imageConfig`) - other
  // adapters ignore these. imageSize: "1K" | "2K" | "4K" (model default is 1K
  // if omitted). aspectRatio: e.g. "1:1", "3:4", "16:9".
  imageSize?: string;
  aspectRatio?: string;
}

export interface ImageGenCallResult {
  images: string[]; // data: URLs, same shape the app already stores
  usage?: UsageInfo;
}

export interface ChatProviderAdapter {
  id: string;
  capabilities: ProviderCapabilities;
  // Full conversational call (threaded history + system instruction). Used both
  // for the actual chat reply and for the image-prompt-derivation step, which
  // needs the same context but a different prompt string.
  generateChat(opts: ChatCallOptions, config: ProviderRuntimeConfig): Promise<ChatCallResult>;
  // Bare one-shot call with no history - used for summarization/compression and
  // long-term memory extraction.
  generateOnce(
    prompt: string,
    model: string,
    config: ProviderRuntimeConfig,
    systemInstruction?: string
  ): Promise<ChatCallResult>;
}

export interface ImageProviderAdapter {
  id: string;
  capabilities: Pick<ProviderCapabilities, "requiresApiKey" | "requiresBaseUrl">;
  generateImage(opts: ImageGenCallOptions, config: ProviderRuntimeConfig): Promise<ImageGenCallResult>;
}
