import { geminiAdapter, geminiImageAdapter } from "./geminiAdapter";
import { anthropicAdapter } from "./anthropicAdapter";
import { openaiImageAdapter } from "./openaiImageAdapter";
import { wanAdapter } from "./wanAdapter";
import { createOpenAiCompatibleAdapter } from "./openaiCompatibleAdapter";
import { ChatProviderAdapter, ImageProviderAdapter } from "./types";

export interface ProviderMeta {
  id: string;
  label: string;
  defaultBaseUrl?: string;
}

// Every provider that speaks the OpenAI Chat Completions wire format shares one
// adapter factory - only the base URL / key requirement differs.
const openaiAdapter = createOpenAiCompatibleAdapter({
  id: "openai",
  label: "OpenAI",
  defaultBaseUrl: "https://api.openai.com/v1",
  requiresApiKey: true,
});
const deepseekAdapter = createOpenAiCompatibleAdapter({
  id: "deepseek",
  label: "DeepSeek",
  defaultBaseUrl: "https://api.deepseek.com/v1",
  requiresApiKey: true,
});
const qwenAdapter = createOpenAiCompatibleAdapter({
  id: "qwen",
  label: "Qwen (DashScope)",
  defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  requiresApiKey: true,
});
const kimiAdapter = createOpenAiCompatibleAdapter({
  id: "kimi",
  label: "Kimi (Moonshot AI)",
  defaultBaseUrl: "https://api.moonshot.cn/v1",
  requiresApiKey: true,
});
const ollamaAdapter = createOpenAiCompatibleAdapter({
  id: "ollama",
  label: "Ollama (local)",
  defaultBaseUrl: "http://localhost:11434/v1",
  requiresApiKey: false,
});

export const CHAT_PROVIDERS: Record<string, ChatProviderAdapter> = {
  gemini: geminiAdapter,
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  deepseek: deepseekAdapter,
  qwen: qwenAdapter,
  kimi: kimiAdapter,
  ollama: ollamaAdapter,
};

// Deliberately a short list: of the requested providers, only Gemini (native),
// OpenAI (DALL-E/gpt-image-1) and Wan (Wanxiang, via DashScope) have real
// image-generation APIs, alongside the existing local SD WebUI integration
// (handled separately - see aiSlice.ts).
export const IMAGE_PROVIDERS: Record<string, ImageProviderAdapter> = {
  gemini: geminiImageAdapter,
  openai: openaiImageAdapter,
  wan: wanAdapter,
};

export const CHAT_PROVIDER_META: ProviderMeta[] = [
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "deepseek", label: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com/v1" },
  { id: "qwen", label: "Qwen (DashScope)", defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "kimi", label: "Kimi (Moonshot AI)", defaultBaseUrl: "https://api.moonshot.cn/v1" },
  { id: "ollama", label: "Ollama (local)", defaultBaseUrl: "http://localhost:11434/v1" },
];

export const IMAGE_PROVIDER_META: ProviderMeta[] = [
  { id: "gemini", label: "Google Gemini (native)" },
  { id: "openai", label: "OpenAI (DALL·E / gpt-image-1)" },
  { id: "wan", label: "Wan (Wanxiang, DashScope)" },
  { id: "sdwebui", label: "Local/Remote SD WebUI Forge" },
];
