import { UsageInfo } from "../types";
import { ImageGenCallOptions, ImageGenCallResult, ImageProviderAdapter, ModelOption, ProviderRuntimeConfig } from "./types";
import { collectReferences, extensionFor, toBlob, withReferenceLegend } from "./referenceImages";

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

// The GPT image models (gpt-image-1, -1-mini, -1.5, -2 and later) can draw
// from reference images through /images/edits: one or more image files
// (`image[]`, up to 16) plus the prompt, with no mask. The DALL-E models
// can't, so they stay text-only.
// https://platform.openai.com/docs/api-reference/images/createEdit
const MAX_REFERENCES = 16;
const takesReferences = (model: string) => /^(gpt-image|chatgpt-image)/i.test(model);

// input_fidelity "high" makes the model hold on to the faces in the input
// images. Only gpt-image-1 and gpt-image-1.5 (and their dated snapshots)
// accept it; gpt-image-1-mini supports only "low" and gpt-image-2 rejects
// the parameter.
const supportsHighFidelity = (model: string) => /^gpt-image-1(\.5)?(-\d{4}-\d{2}-\d{2})?$/i.test(model);

const parseImages = (data: any): string[] =>
  (data?.data || [])
    .map((item: { b64_json?: string; url?: string }) =>
      item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url
    )
    .filter(Boolean);

const generateImage = async (opts: ImageGenCallOptions, config: ProviderRuntimeConfig): Promise<ImageGenCallResult> => {
  if (!config.apiKey) throw new Error("An OpenAI API key is required.");

  const refs = takesReferences(opts.model) ? collectReferences(opts, MAX_REFERENCES) : { images: [], names: [] };

  let response: Response;
  if (refs.images.length > 0) {
    // Multipart, so no Content-Type header: the browser sets it with the boundary.
    const form = new FormData();
    form.append("model", opts.model);
    form.append("prompt", withReferenceLegend(opts.prompt, refs.names));
    form.append("n", "1");
    if (supportsHighFidelity(opts.model)) form.append("input_fidelity", "high");
    refs.images.forEach((img, i) => {
      form.append("image[]", toBlob(img), `reference-${i + 1}.${extensionFor(img.mimeType)}`);
    });
    response = await fetch(`${OPENAI_BASE_URL}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: opts.signal,
    });
  } else {
    response = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
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
  }

  if (!response.ok) {
    throw new Error(`OpenAI image generation error: ${await extractErrorMessage(response)}`);
  }

  const data = await response.json();
  return { images: parseImages(data), usage: normalizeUsage(data?.usage) };
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
