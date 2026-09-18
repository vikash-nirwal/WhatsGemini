import { ImageGenCallOptions, ImageGenCallResult, ImageProviderAdapter, ProviderRuntimeConfig } from "./types";

// GLM/CogView via Zhipu AI's Z.ai platform - unlike Wan this is a plain
// synchronous call (one POST, image URL comes straight back), no task
// polling. The result URL is valid 30 days rather than permanently, so it's
// opportunistically converted to a data: URL the same way Wan's is - falling
// back to the raw URL if the browser can't read the bytes cross-origin.
const GLM_BASE_URL = "https://api.z.ai/api/paas/v4";

const extractErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return body?.error?.message || body?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const toDataUrl = async (url: string): Promise<string> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : url);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
};

const generateImage = async (opts: ImageGenCallOptions, config: ProviderRuntimeConfig): Promise<ImageGenCallResult> => {
  if (!config.apiKey) throw new Error("A Z.ai (Zhipu AI) API key is required.");

  const response = await fetch(`${GLM_BASE_URL}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: opts.model, prompt: opts.prompt }),
    signal: opts.signal,
  });
  if (!response.ok) {
    throw new Error(`GLM image generation error: ${await extractErrorMessage(response)}`);
  }

  const data = await response.json();
  const urls: string[] = (data?.data || []).map((item: { url?: string }) => item.url).filter(Boolean);
  const images = await Promise.all(urls.map(toDataUrl));
  return { images };
};

export const glmImageAdapter: ImageProviderAdapter = {
  id: "glm",
  capabilities: { requiresApiKey: true, requiresBaseUrl: false },
  generateImage,
};
