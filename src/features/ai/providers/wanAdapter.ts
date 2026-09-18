import { ImageGenCallOptions, ImageGenCallResult, ImageProviderAdapter, ProviderRuntimeConfig } from "./types";

// Wan (Wanxiang) via Alibaba Cloud Model Studio/DashScope. Unlike every other
// image provider here this is an async task API - submitting a prompt returns
// a task_id that has to be polled until it resolves (typically 1-2 minutes) -
// and Alibaba no longer offers a fixed, non-workspace-scoped host: callers
// must supply their own workspace endpoint from the Model Studio console
// (config.baseUrl), same shape as Ollama's requiresBaseUrl.
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 36; // ~3 minutes

interface WanTaskContent {
  image?: string;
  type?: string;
}

const extractErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return body?.message || body?.output?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

// The rest of the app stores generated images as data: URLs (so they survive
// a reload/persist to IndexedDB), but Wan's result URLs point at Alibaba OSS
// and expire after 24h. Convert to base64 when the browser can actually read
// the bytes; if the OSS bucket doesn't grant this origin CORS, fall back to
// the raw (temporary) URL rather than failing the whole generation.
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
  if (!config.apiKey) throw new Error("A DashScope (Alibaba Cloud Model Studio) API key is required.");
  if (!config.baseUrl) throw new Error("A Wan workspace endpoint URL is required - copy it from the Model Studio console.");

  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const authHeader = { Authorization: `Bearer ${config.apiKey}` };

  const createResponse = await fetch(`${baseUrl}/api/v1/services/aigc/image-generation/generation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader, "X-DashScope-Async": "enable" },
    body: JSON.stringify({
      model: opts.model,
      input: { messages: [{ role: "user", content: [{ text: opts.prompt }] }] },
      parameters: { n: 1 },
    }),
    signal: opts.signal,
  });
  if (!createResponse.ok) {
    throw new Error(`Wan image generation error: ${await extractErrorMessage(createResponse)}`);
  }
  const createData = await createResponse.json();
  const taskId = createData?.output?.task_id;
  if (!taskId) throw new Error("Wan image generation error: no task_id returned.");

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (opts.signal?.aborted) throw new Error("Image generation aborted.");

    const pollResponse = await fetch(`${baseUrl}/api/v1/tasks/${taskId}`, { headers: authHeader, signal: opts.signal });
    if (!pollResponse.ok) {
      throw new Error(`Wan image generation error: ${await extractErrorMessage(pollResponse)}`);
    }
    const pollData = await pollResponse.json();
    const status = pollData?.output?.task_status;

    if (status === "SUCCEEDED") {
      const content: WanTaskContent[] = pollData?.output?.choices?.[0]?.message?.content || [];
      const urls = content.filter((c) => c.type === "image" && c.image).map((c) => c.image as string);
      const images = await Promise.all(urls.map(toDataUrl));
      return { images };
    }
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      throw new Error(`Wan image generation ${String(status).toLowerCase()}: ${pollData?.output?.message || "unknown error"}`);
    }
    // PENDING / RUNNING - keep polling
  }

  throw new Error("Wan image generation timed out.");
};

export const wanAdapter: ImageProviderAdapter = {
  id: "wan",
  capabilities: { requiresApiKey: true, requiresBaseUrl: true },
  generateImage,
};
