import { geminiAdapter, geminiImageAdapter } from "./geminiAdapter";
import { anthropicAdapter } from "./anthropicAdapter";
import { openaiImageAdapter } from "./openaiImageAdapter";
import { glmImageAdapter } from "./glmImageAdapter";
import { wanAdapter, wanVideoAdapter } from "./wanAdapter";
import { falImageAdapter } from "./falImageAdapter";
import { webllmAdapter } from "./webllmAdapter";
import { comfyuiAdapter } from "./comfyuiAdapter";
import { createOpenAiCompatibleAdapter } from "./openaiCompatibleAdapter";
import { ChatProviderAdapter, ImageProviderAdapter, VideoProviderAdapter } from "./types";
import { withRequestLog } from "../requestLog";
import { withChatSpending, withImageSpending, withVideoSpending } from "../../spending/spendingAdapters";

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
// Router across many hosted models, including ones whose terms allow
// mature fiction - the usual choice for NSFW roleplay without a local GPU.
const openrouterAdapter = createOpenAiCompatibleAdapter({
  id: "openrouter",
  label: "OpenRouter",
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  requiresApiKey: true,
});
const glmAdapter = createOpenAiCompatibleAdapter({
  id: "glm",
  label: "GLM (Zhipu AI / Z.ai)",
  defaultBaseUrl: "https://api.z.ai/api/paas/v4",
  requiresApiKey: true,
});

// Every chat adapter is wrapped by withRequestLog, so each call lands in the
// prompt inspector's log (#31) without aiSlice or the utils knowing about it.
// The spending wrapper (#42) sits outside it, so a call the monthly limit
// stops never reaches the log.
const RAW_CHAT_PROVIDERS: Record<string, ChatProviderAdapter> = {
  gemini: geminiAdapter,
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  deepseek: deepseekAdapter,
  qwen: qwenAdapter,
  kimi: kimiAdapter,
  glm: glmAdapter,
  openrouter: openrouterAdapter,
  ollama: ollamaAdapter,
  webllm: webllmAdapter,
};

export const CHAT_PROVIDERS: Record<string, ChatProviderAdapter> = Object.fromEntries(
  Object.entries(RAW_CHAT_PROVIDERS).map(([id, adapter]) => [id, withChatSpending(withRequestLog(adapter))])
);

// Of the requested providers, Gemini (native), OpenAI (DALL-E/gpt-image-1),
// Wan (Wanxiang, via DashScope) and GLM (CogView/GLM-Image, via Z.ai) have
// real image-generation APIs, alongside the existing local SD WebUI
// integration (handled separately - see aiSlice.ts). fal.ai hosts Seedream
// and FLUX Kontext, which keep faces consistent from reference photos.
// Wrapped for spending like the chat adapters; ComfyUI is free, so its
// wrapper never blocks or records it. SD WebUI isn't an adapter at all.
const RAW_IMAGE_PROVIDERS: Record<string, ImageProviderAdapter> = {
  gemini: geminiImageAdapter,
  openai: openaiImageAdapter,
  wan: wanAdapter,
  glm: glmImageAdapter,
  fal: falImageAdapter,
  comfyui: comfyuiAdapter,
};

export const IMAGE_PROVIDERS: Record<string, ImageProviderAdapter> = Object.fromEntries(
  Object.entries(RAW_IMAGE_PROVIDERS).map(([id, adapter]) => [id, withImageSpending(adapter)])
);

export const CHAT_PROVIDER_META: ProviderMeta[] = [
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "deepseek", label: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com/v1" },
  { id: "qwen", label: "Qwen (DashScope)", defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "kimi", label: "Kimi (Moonshot AI)", defaultBaseUrl: "https://api.moonshot.cn/v1" },
  { id: "glm", label: "GLM (Zhipu AI / Z.ai)", defaultBaseUrl: "https://api.z.ai/api/paas/v4" },
  { id: "openrouter", label: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api/v1" },
  { id: "ollama", label: "Ollama (local)", defaultBaseUrl: "http://localhost:11434/v1" },
  { id: "webllm", label: "In this browser (free, WebLLM)" },
];

export const IMAGE_PROVIDER_META: ProviderMeta[] = [
  { id: "gemini", label: "Google Gemini (native)" },
  { id: "openai", label: "OpenAI (DALL·E / gpt-image-1)" },
  { id: "wan", label: "Wan (Wanxiang, DashScope)" },
  { id: "glm", label: "GLM (CogView / GLM-Image, Z.ai)" },
  { id: "fal", label: "fal.ai (Seedream / FLUX Kontext)" },
  { id: "sdwebui", label: "Local/Remote SD WebUI Forge" },
  { id: "comfyui", label: "ComfyUI (local)" },
];

// Wan is the only video-generation provider on offer - same DashScope
// account/key/workspace endpoint as its image adapter above.
export const VIDEO_PROVIDERS: Record<string, VideoProviderAdapter> = {
  wan: withVideoSpending(wanVideoAdapter),
};

export const VIDEO_PROVIDER_META: ProviderMeta[] = [{ id: "wan", label: "Wan (Wanxiang, DashScope)" }];
