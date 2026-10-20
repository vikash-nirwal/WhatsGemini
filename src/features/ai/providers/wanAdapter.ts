import {
  ImageGenCallOptions,
  ImageGenCallResult,
  ImageProviderAdapter,
  ProviderRuntimeConfig,
  VideoGenCallOptions,
  VideoGenCallResult,
  VideoProviderAdapter,
} from "./types";
import { collectReferences, toDataUri, withReferenceLegend } from "./referenceImages";
import { getStoredValue } from "../utils/settings";
import { DEFAULT_WAN_REFERENCE_MODEL, LS_WAN_REFERENCE_MODEL } from "../../../utils/constants";

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

// wan2.5-i2i-preview has its own endpoint and body (input.prompt +
// input.images, at most 3) and can't draw from text alone; every other
// reference-capable model (wan2.7-image, wan2.7-image-pro) takes up to 9
// images as `image` items in the same messages body the text-only call uses.
// https://www.alibabacloud.com/help/en/model-studio/wan2-5-image-edit-api-reference
// https://www.alibabacloud.com/help/en/model-studio/wan-image-generation-and-editing-api-reference
const I2I_MODEL_PREFIX = "wan2.5-i2i";
const I2I_MAX_REFERENCES = 3;
const MESSAGES_MAX_REFERENCES = 9;
const isI2iModel = (model: string) => model.startsWith(I2I_MODEL_PREFIX);

// Thrown when Wan rejects the task at submission, as opposed to a task that
// fails later - lets the wan2.5-i2i-preview path tell "this region or account
// can't use that model" apart from a generation that simply didn't work.
class WanSubmitError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WanSubmitError";
  }
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
    throw new WanSubmitError(`Wan ${label} error: ${await extractErrorMessage(createResponse)}`, createResponse.status);
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

// The reference-photo model the user picked in Settings (#36). Read here
// rather than passed in, since it only matters to this adapter.
const getReferenceModel = (): string => getStoredValue(LS_WAN_REFERENCE_MODEL, DEFAULT_WAN_REFERENCE_MODEL) || DEFAULT_WAN_REFERENCE_MODEL;

const pickMessageImages = (output: any): string[] => {
  const content: WanTaskContent[] = output?.choices?.[0]?.message?.content || [];
  return content.filter((c) => c.type === "image" && c.image).map((c) => c.image as string);
};

const generateImage = async (opts: ImageGenCallOptions, config: ProviderRuntimeConfig): Promise<ImageGenCallResult> => {
  if (!config.apiKey) throw new Error("A DashScope (Alibaba Cloud Model Studio) API key is required.");
  if (!config.baseUrl) throw new Error("A Wan workspace endpoint URL is required - copy it from the Model Studio console.");
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const apiKey = config.apiKey;

  const runMessagesTask = (model: string, content: Record<string, string>[]) =>
    runTask(
      "image generation",
      `${baseUrl}/api/v1/services/aigc/image-generation/generation`,
      { model, input: { messages: [{ role: "user", content }] }, parameters: { n: 1 } },
      baseUrl,
      apiKey,
      opts.signal,
      IMAGE_POLL_INTERVAL_MS,
      IMAGE_MAX_POLL_ATTEMPTS,
      pickMessageImages
    );

  const referenceModel = getReferenceModel();
  const useReferences = referenceModel !== "none";
  const limit = isI2iModel(referenceModel) ? I2I_MAX_REFERENCES : MESSAGES_MAX_REFERENCES;
  const refs = useReferences ? collectReferences(opts, limit) : { images: [], names: [] };

  let urls: string[];
  if (refs.images.length === 0) {
    // Text only. wan2.5-i2i-preview can't draw without an input image, so if
    // it ended up as the main model, the default reference model (which
    // also does text-to-image) draws instead.
    const model = isI2iModel(opts.model) ? DEFAULT_WAN_REFERENCE_MODEL : opts.model;
    urls = await runMessagesTask(model, [{ text: opts.prompt }]);
  } else {
    const prompt = withReferenceLegend(opts.prompt, refs.names);
    const imageItems = refs.images.map((img) => ({ image: toDataUri(img) }));
    const runWithMessages = () =>
      runMessagesTask(isI2iModel(referenceModel) ? DEFAULT_WAN_REFERENCE_MODEL : referenceModel, [
        { text: prompt },
        ...imageItems.slice(0, MESSAGES_MAX_REFERENCES),
      ]);

    if (isI2iModel(referenceModel)) {
      try {
        urls = await runTask(
          "image edit",
          `${baseUrl}/api/v1/services/aigc/image2image/image-synthesis`,
          { model: referenceModel, input: { prompt, images: imageItems.map((i) => i.image) }, parameters: { n: 1 } },
          baseUrl,
          apiKey,
          opts.signal,
          IMAGE_POLL_INTERVAL_MS,
          IMAGE_MAX_POLL_ATTEMPTS,
          (output) => ((output?.results || []) as { url?: string }[]).map((r) => r.url).filter((u): u is string => !!u)
        );
      } catch (err) {
        // Alibaba lists wan2.5-i2i-preview as image-only input in the
        // Singapore region, so a workspace there may refuse a prompt plus
        // images. A rejected submission (not a bad key, which would fail the
        // retry too) retries once on wan2.7-image, which takes both everywhere.
        if (!(err instanceof WanSubmitError) || err.status === 401) throw err;
        console.warn(`${referenceModel} was rejected, retrying with ${DEFAULT_WAN_REFERENCE_MODEL}:`, err.message);
        urls = await runWithMessages();
      }
    } else {
      urls = await runWithMessages();
    }
  }

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
