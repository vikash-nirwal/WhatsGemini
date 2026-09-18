import {
  ImageGenCallOptions,
  ImageGenCallResult,
  ImageProviderAdapter,
  ProviderRuntimeConfig,
  VideoGenCallOptions,
  VideoGenCallResult,
  VideoProviderAdapter,
} from "./types";

// Wan (Wanxiang) via Alibaba Cloud Model Studio/DashScope - covers both image
// and video generation, since both are the same kind of API: an async task -
// submitting a prompt returns a task_id that has to be polled until it
// resolves (1-2 min for images, 1-5+ min for video) - against a per-workspace
// host Alibaba no longer offers a fixed alternative to: callers must supply
// their own workspace endpoint from the Model Studio console (config.baseUrl),
// same shape as Ollama's requiresBaseUrl.
const IMAGE_POLL_INTERVAL_MS = 5000;
const IMAGE_MAX_POLL_ATTEMPTS = 36; // ~3 minutes
const VIDEO_POLL_INTERVAL_MS = 10000;
const VIDEO_MAX_POLL_ATTEMPTS = 60; // ~10 minutes

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

// The rest of the app stores generated media as data: URLs (so they survive
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

// Shared submit-then-poll flow for both endpoints - only the create URL/body,
// poll cadence, and how a SUCCEEDED payload's media URL(s) are picked out differ.
const runTask = async <T>(
  label: string,
  createUrl: string,
  createBody: unknown,
  baseUrl: string,
  apiKey: string,
  signal: AbortSignal | undefined,
  pollIntervalMs: number,
  maxPollAttempts: number,
  onSucceeded: (output: any) => T
): Promise<T> => {
  const authHeader = { Authorization: `Bearer ${apiKey}` };

  const createResponse = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader, "X-DashScope-Async": "enable" },
    body: JSON.stringify(createBody),
    signal,
  });
  if (!createResponse.ok) {
    throw new Error(`Wan ${label} error: ${await extractErrorMessage(createResponse)}`);
  }
  const createData = await createResponse.json();
  const taskId = createData?.output?.task_id;
  if (!taskId) throw new Error(`Wan ${label} error: no task_id returned.`);

  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    if (signal?.aborted) throw new Error(`${label} aborted.`);

    const pollResponse = await fetch(`${baseUrl}/api/v1/tasks/${taskId}`, { headers: authHeader, signal });
    if (!pollResponse.ok) {
      throw new Error(`Wan ${label} error: ${await extractErrorMessage(pollResponse)}`);
    }
    const pollData = await pollResponse.json();
    const status = pollData?.output?.task_status;

    if (status === "SUCCEEDED") return onSucceeded(pollData.output);
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      throw new Error(`Wan ${label} ${String(status).toLowerCase()}: ${pollData?.output?.message || "unknown error"}`);
    }
    // PENDING / RUNNING - keep polling
  }

  throw new Error(`Wan ${label} timed out.`);
};

const generateImage = async (opts: ImageGenCallOptions, config: ProviderRuntimeConfig): Promise<ImageGenCallResult> => {
  if (!config.apiKey) throw new Error("A DashScope (Alibaba Cloud Model Studio) API key is required.");
  if (!config.baseUrl) throw new Error("A Wan workspace endpoint URL is required - copy it from the Model Studio console.");
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  const urls = await runTask(
    "image generation",
    `${baseUrl}/api/v1/services/aigc/image-generation/generation`,
    { model: opts.model, input: { messages: [{ role: "user", content: [{ text: opts.prompt }] }] }, parameters: { n: 1 } },
    baseUrl,
    config.apiKey,
    opts.signal,
    IMAGE_POLL_INTERVAL_MS,
    IMAGE_MAX_POLL_ATTEMPTS,
    (output) => {
      const content: WanTaskContent[] = output?.choices?.[0]?.message?.content || [];
      return content.filter((c) => c.type === "image" && c.image).map((c) => c.image as string);
    }
  );
  const images = await Promise.all(urls.map(toDataUrl));
  return { images };
};

const generateVideo = async (opts: VideoGenCallOptions, config: ProviderRuntimeConfig): Promise<VideoGenCallResult> => {
  if (!config.apiKey) throw new Error("A DashScope (Alibaba Cloud Model Studio) API key is required.");
  if (!config.baseUrl) throw new Error("A Wan workspace endpoint URL is required - copy it from the Model Studio console.");
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  const url = await runTask(
    "video generation",
    `${baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`,
    { model: opts.model, input: { prompt: opts.prompt } },
    baseUrl,
    config.apiKey,
    opts.signal,
    VIDEO_POLL_INTERVAL_MS,
    VIDEO_MAX_POLL_ATTEMPTS,
    (output) => output?.video_url as string | undefined
  );
  const videos = url ? [await toDataUrl(url)] : [];
  return { videos };
};

export const wanAdapter: ImageProviderAdapter = {
  id: "wan",
  capabilities: { requiresApiKey: true, requiresBaseUrl: true },
  generateImage,
};

export const wanVideoAdapter: VideoProviderAdapter = {
  id: "wan",
  capabilities: { requiresApiKey: true, requiresBaseUrl: true },
  generateVideo,
};
