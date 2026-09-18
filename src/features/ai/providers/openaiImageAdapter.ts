import { UsageInfo } from "../types";
import { ImageGenCallOptions, ImageGenCallResult, ImageProviderAdapter, ModelOption, ProviderRuntimeConfig } from "./types";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

interface OpenAiImageUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

const normalizeUsage = (usage?: OpenAiImageUsage): UsageInfo | undefined => {
  if (!usage) return undefined;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  return { inputTokens, outputTokens, totalTokens: usage.total_tokens || inputTokens + outputTokens };
};

const extractErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return body?.error?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

// DALL-E 3 / gpt-image-1 generations endpoint. Reference images aren't wired
// here - OpenAI's image *edits* endpoint takes a single PNG mask input, which
// isn't an equivalent to Gemini's multi-reference inline-image conditioning,
// so this stays text-to-image only for now.
const generateImage = async (opts: ImageGenCallOptions, config: ProviderRuntimeConfig): Promise<ImageGenCallResult> => {
  if (!config.apiKey) throw new Error("An OpenAI API key is required.");

  const response = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      n: 1,
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    throw new Error(`OpenAI image generation error: ${await extractErrorMessage(response)}`);
  }

  const data = await response.json();
  const images: string[] = (data?.data || [])
    .map((item: { b64_json?: string; url?: string }) =>
      item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url
    )
    .filter(Boolean);

  return { images, usage: normalizeUsage(data?.usage) };
};

// Unlike GLM's /models (chat-only - see glmImageAdapter.ts), OpenAI's
// account-wide model listing does include dall-e-2/dall-e-3/gpt-image-1
// alongside every chat model, so this is filtered down by id prefix rather
// than trusting the whole list is image-capable.
const listModels = async (config: ProviderRuntimeConfig): Promise<ModelOption[]> => {
  if (!config.apiKey) throw new Error("An OpenAI API key is required.");

  const response = await fetch(`${OPENAI_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`OpenAI error: ${await extractErrorMessage(response)}`);
  }

  const data = await response.json();
  const list: any[] = data?.data || [];
  return list
    .filter((m) => /^(dall-e|gpt-image)/i.test(m.id))
    .map((m) => ({ value: m.id as string, label: m.id as string }))
    .sort((a, b) => a.value.localeCompare(b.value));
};

export const openaiImageAdapter: ImageProviderAdapter = {
  id: "openai",
  capabilities: { requiresApiKey: true, requiresBaseUrl: false },
  generateImage,
  listModels,
};
