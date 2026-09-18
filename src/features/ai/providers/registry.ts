import { geminiAdapter, geminiImageAdapter } from "./geminiAdapter";
import { anthropicAdapter } from "./anthropicAdapter";
import { openaiImageAdapter } from "./openaiImageAdapter";
import { glmImageAdapter } from "./glmImageAdapter";
import { wanAdapter, wanVideoAdapter } from "./wanAdapter";
import { createOpenAiCompatibleAdapter } from "./openaiCompatibleAdapter";
import { ChatProviderAdapter, ImageProviderAdapter, VideoProviderAdapter } from "./types";

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
const glmAdapter = createOpenAiCompatibleAdapter({
  id: "glm",
  label: "GLM (Zhipu AI / Z.ai)",
  defaultBaseUrl: "https://api.z.ai/api/paas/v4",
  requiresApiKey: true,
});

export const CHAT_PROVIDERS: Record<string, ChatProviderAdapter> = {
  gemini: geminiAdapter,
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  deepseek: deepseekAdapter,
  qwen: qwenAdapter,
  kimi: kimiAdapter,
  glm: glmAdapter,
  ollama: ollamaAdapter,
};

// Of the requested providers, Gemini (native), OpenAI (DALL-E/gpt-image-1),
// Wan (Wanxiang, via DashScope) and GLM (CogView/GLM-Image, via Z.ai) have
// real image-generation APIs, alongside the existing local SD WebUI
// integration (handled separately - see aiSlice.ts).
export const IMAGE_PROVIDERS: Record<string, ImageProviderAdapter> = {
  gemini: geminiImageAdapter,
  openai: openaiImageAdapter,
  wan: wanAdapter,
  glm: glmImageAdapter,
};

export const CHAT_PROVIDER_META: ProviderMeta[] = [
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "deepseek", label: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com/v1" },
  { id: "qwen", label: "Qwen (DashScope)", defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "kimi", label: "Kimi (Moonshot AI)", defaultBaseUrl: "https://api.moonshot.cn/v1" },
  { id: "glm", label: "GLM (Zhipu AI / Z.ai)", defaultBaseUrl: "https://api.z.ai/api/paas/v4" },
  { id: "ollama", label: "Ollama (local)", defaultBaseUrl: "http://localhost:11434/v1" },
];

export const IMAGE_PROVIDER_META: ProviderMeta[] = [
  { id: "gemini", label: "Google Gemini (native)" },
  { id: "openai", label: "OpenAI (DALL·E / gpt-image-1)" },
  { id: "wan", label: "Wan (Wanxiang, DashScope)" },
  { id: "glm", label: "GLM (CogView / GLM-Image, Z.ai)" },
  { id: "sdwebui", label: "Local/Remote SD WebUI Forge" },
];

// Wan is the only video-generation provider on offer - same DashScope
// account/key/workspace endpoint as its image adapter above.
export const VIDEO_PROVIDERS: Record<string, VideoProviderAdapter> = {
  wan: wanVideoAdapter,
};

export const VIDEO_PROVIDER_META: ProviderMeta[] = [{ id: "wan", label: "Wan (Wanxiang, DashScope)" }];
