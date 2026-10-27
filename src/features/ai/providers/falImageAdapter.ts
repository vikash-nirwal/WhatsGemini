import { NormalizedImage } from "../types";
import { ContentBlockedError, ImageGenCallOptions, ImageGenCallResult, ImageProviderAdapter, ModelOption, ProviderRuntimeConfig } from "./types";
import { collectReferences, extensionFor, toBlob, toDataUri, withReferenceLegend } from "./referenceImages";
import { customFalModels, FALLBACK_TEXT_ENDPOINT, textSiblingsOf } from "./falCatalog";

// fal.ai's queue API, called straight from the browser: queue.fal.run,
// rest.fal.ai (file uploads) and fal.media (results) all answer CORS
// preflights for any origin. Submitting returns a request id and the status
// and result URLs to poll; requests usually finish in 5-30 seconds.
// https://fal.ai/docs/model-apis/model-endpoints/queue
const QUEUE_URL = "https://queue.fal.run";
const STORAGE_INITIATE_URL = "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 90; // ~3 minutes

type SizeStyle = "image_size" | "aspect_ratio" | "resolution_mode" | "none";

interface FalModel {
  label: string;
  // The endpoint used when the picture has reference photos, and the field
  // they go in. A single-image field gets only the main reference.
  referenceEndpoint: string;
  referenceField: string; // image_urls, image_url, reference_image_url, ... (a list when it ends in "urls")
  maxReferences: number;
  referenceSize: SizeStyle;
  // The endpoint used without reference photos.
  textEndpoint: string;
  textSize: SizeStyle;
}

// Keyed by the reference endpoint's id, which is what Settings stores as the
// image model. Input schemas: https://fal.ai/models/<endpoint id>/api
export const FAL_IMAGE_MODELS: Record<string, FalModel> = {
  "fal-ai/bytedance/seedream/v4/edit": {
    label: "Seedream 4 (up to 10 references)",
    referenceEndpoint: "fal-ai/bytedance/seedream/v4/edit",
    referenceField: "image_urls",
    maxReferences: 10,
    referenceSize: "image_size",
    textEndpoint: "fal-ai/bytedance/seedream/v4/text-to-image",
    textSize: "image_size",
  },
  "fal-ai/bytedance/seedream/v4.5/edit": {
    label: "Seedream 4.5 (up to 10 references)",
    referenceEndpoint: "fal-ai/bytedance/seedream/v4.5/edit",
    referenceField: "image_urls",
    maxReferences: 10,
    referenceSize: "image_size",
    textEndpoint: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    textSize: "image_size",
  },
  "fal-ai/flux-pro/kontext": {
    label: "FLUX.1 Kontext pro (1 reference)",
    referenceEndpoint: "fal-ai/flux-pro/kontext",
    referenceField: "image_url",
    maxReferences: 1,
    referenceSize: "aspect_ratio",
    textEndpoint: "fal-ai/flux-pro/kontext/text-to-image",
    textSize: "aspect_ratio",
  },
  "fal-ai/flux-kontext/dev": {
    label: "FLUX.1 Kontext dev (1 reference)",
    referenceEndpoint: "fal-ai/flux-kontext/dev",
    referenceField: "image_url",
    maxReferences: 1,
    referenceSize: "resolution_mode",
    textEndpoint: "fal-ai/flux/dev",
    textSize: "image_size",
  },
  "fal-ai/flux-pulid": {
    label: "FLUX PuLID face ID (1 reference)",
    referenceEndpoint: "fal-ai/flux-pulid",
    referenceField: "reference_image_url",
    maxReferences: 1,
    referenceSize: "image_size",
    textEndpoint: "fal-ai/flux/dev",
    textSize: "image_size",
  },
};

export const DEFAULT_FAL_IMAGE_MODEL = "fal-ai/bytedance/seedream/v4/edit";

export const FAL_IMAGE_MODEL_OPTIONS: ModelOption[] = Object.entries(FAL_IMAGE_MODELS).map(([value, m]) => ({ value, label: m.label }));

// fal's named sizes, by the aspect ratio the app asks for. Kontext takes the
// ratio itself (aspect_ratio / resolution_mode); the rest take these names.
const IMAGE_SIZE_BY_RATIO: Record<string, string> = {
  "1:1": "square_hd",
  "3:4": "portrait_4_3",
  "9:16": "portrait_16_9",
  "4:3": "landscape_4_3",
  "16:9": "landscape_16_9",
};
const KONTEXT_RATIOS = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"];

const sizeParams = (style: SizeStyle, aspectRatio: string | undefined): Record<string, string> => {
  if (!aspectRatio) return {};
  if (style === "image_size" && IMAGE_SIZE_BY_RATIO[aspectRatio]) return { image_size: IMAGE_SIZE_BY_RATIO[aspectRatio] };
  if (style === "aspect_ratio" && KONTEXT_RATIOS.includes(aspectRatio)) return { aspect_ratio: aspectRatio };
  if (style === "resolution_mode" && KONTEXT_RATIOS.includes(aspectRatio)) return { resolution_mode: aspectRatio };
  return {};
};

const describeDetail = (detail: unknown): string | undefined => {
  if (typeof detail === "string") return detail;
  // Validation errors come back as a list of { loc, msg }; the field's name
  // says what's missing ("image_urls: Field required").
  if (Array.isArray(detail))
    return detail.map((d) => {
      const field = Array.isArray(d?.loc) ? d.loc.filter((l: unknown) => l !== "body").join(".") : "";
      return d?.msg ? `${field ? `${field}: ` : ""}${d.msg}` : JSON.stringify(d);
    }).join("; ");
  return undefined;
};

const extractErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return describeDetail(body?.detail) || body?.error || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

// fal's own client uploads image inputs to its CDN and sends the URL, which
// every model accepts; only some models document data URIs. So each
// reference is uploaded the same way (initiate, then PUT the bytes), and
// only if that fails does it go inline as a data URI.
const uploadReference = async (image: NormalizedImage, index: number, apiKey: string, signal?: AbortSignal): Promise<string> => {
  try {
    const initiate = await fetch(STORAGE_INITIATE_URL, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: image.mimeType, file_name: `reference-${index + 1}.${extensionFor(image.mimeType)}` }),
      signal,
    });
    if (!initiate.ok) throw new Error(await extractErrorMessage(initiate));
    const { upload_url: uploadUrl, file_url: fileUrl } = await initiate.json();
    if (!uploadUrl || !fileUrl) throw new Error("no upload URL returned");
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": image.mimeType }, body: toBlob(image), signal });
    if (!put.ok) throw new Error(`${put.status} ${put.statusText}`);
    return fileUrl;
  } catch (err: any) {
    if (signal?.aborted) throw err;
    console.warn("fal.ai upload failed, sending the reference inline:", err?.message);
    return toDataUri(image);
  }
};

// Same as wanAdapter's: store results as data: URLs so they survive a reload.
// fal.media allows any origin; if a download still fails, keep the URL.
const toDataUrl = async (url: string): Promise<string> => {
  if (url.startsWith("data:")) return url;
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

const runQueue = async (endpoint: string, input: Record<string, unknown>, apiKey: string, signal?: AbortSignal): Promise<any> => {
  const auth = { Authorization: `Key ${apiKey}` };
  const submit = await fetch(`${QUEUE_URL}/${endpoint}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!submit.ok) throw new Error(`fal.ai error: ${await extractErrorMessage(submit)}`);
  const queued = await submit.json();
  // Use the URLs fal returns: for an endpoint with a sub-path (e.g.
  // fal-ai/flux-pro/kontext) they name only the app, and a URL built from
  // the full endpoint id would get a 405.
  const statusUrl: string | undefined = queued?.status_url;
  const responseUrl: string | undefined = queued?.response_url;
  if (!statusUrl || !responseUrl) throw new Error("fal.ai error: no request id returned.");

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (signal?.aborted) {
      if (queued.cancel_url) fetch(queued.cancel_url, { method: "PUT", headers: auth }).catch(() => {});
      throw new Error("Image generation aborted.");
    }
    const statusResponse = await fetch(statusUrl, { headers: auth, signal });
    if (!statusResponse.ok) throw new Error(`fal.ai error: ${await extractErrorMessage(statusResponse)}`);
    const status = await statusResponse.json();
    if (status?.status !== "COMPLETED") continue; // IN_QUEUE / IN_PROGRESS
    if (status.error) throw new Error(`fal.ai error: ${status.error}`);

    const result = await fetch(responseUrl, { headers: auth, signal });
    if (!result.ok) throw new Error(`fal.ai error: ${await extractErrorMessage(result)}`);
    return result.json();
  }
  throw new Error("fal.ai image generation timed out.");
};

const generateImage = async (opts: ImageGenCallOptions, config: ProviderRuntimeConfig): Promise<ImageGenCallResult> => {
  if (!config.apiKey) throw new Error("A fal.ai API key is required.");
  const apiKey = config.apiKey;

  // A model left over from another provider (say gpt-image-1 after switching)
  // falls back to the default rather than failing.
  // Or one picked from fal's own list, set up from its schema (falCatalog).
  const model = FAL_IMAGE_MODELS[opts.model] || customFalModels()[opts.model] || FAL_IMAGE_MODELS[DEFAULT_FAL_IMAGE_MODEL];
  const refs = collectReferences(opts, model.maxReferences);

  let endpoint: string;
  let input: Record<string, unknown>;
  if (refs.images.length > 0) {
    const urls = await Promise.all(refs.images.map((img, i) => uploadReference(img, i, apiKey, opts.signal)));
    endpoint = model.referenceEndpoint;
    input = {
      prompt: withReferenceLegend(opts.prompt, refs.names),
      [model.referenceField]: model.referenceField.endsWith("urls") ? urls : urls[0],
      ...sizeParams(model.referenceSize, opts.aspectRatio),
    };
  } else {
    endpoint = model.textEndpoint;
    input = { prompt: opts.prompt, ...sizeParams(model.textSize, opts.aspectRatio) };
  }

  // An edit model picked before 2026-10-27 may be set to run without a
  // photo, which it can't: then its text-to-image sibling, and the default
  // text model last. Models say so in their own words ("Field required",
  // Seedream's "At least one image URL is required."), so any "required"
  // counts.
  const fallbacks = refs.images.length === 0 && model.textEndpoint === model.referenceEndpoint && model.maxReferences > 0
    ? [...textSiblingsOf(endpoint).map((id) => ({ id, input })), { id: FALLBACK_TEXT_ENDPOINT, input: { prompt: opts.prompt, ...sizeParams("image_size", opts.aspectRatio) } }]
    : [];
  let output: any;
  for (const attempt of [{ id: endpoint, input }, ...fallbacks]) {
    try {
      output = await runQueue(attempt.id, attempt.input, apiKey, opts.signal);
      break;
    } catch (err: any) {
      const last = attempt.id === (fallbacks[fallbacks.length - 1]?.id ?? endpoint);
      if (last || opts.signal?.aborted || !/required|not found|404|405/i.test(err?.message || "")) throw err;
    }
  }
  // FLUX's safety checker returns a black image and flags it rather than
  // failing the request.
  if (Array.isArray(output?.has_nsfw_concepts) && output.has_nsfw_concepts.some(Boolean)) {
    throw new ContentBlockedError("fal.ai", "safety checker");
  }
  const urls: string[] = ((output?.images || []) as { url?: string }[]).map((i) => i.url).filter((u): u is string => !!u);
  const images = await Promise.all(urls.map(toDataUrl));
  return { images };
};

export const falImageAdapter: ImageProviderAdapter = {
  id: "fal",
  capabilities: { requiresApiKey: true, requiresBaseUrl: false },
  generateImage,
};
