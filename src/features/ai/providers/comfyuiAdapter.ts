import type { ImageGenCallOptions, ImageGenCallResult, ImageProviderAdapter } from "./types";
import type { NormalizedImage } from "../types";
import { cancelPrompt, fetchOutputImage, normalizeServerUrl, queuePrompt, uploadImage, waitForOutputs } from "../comfyui/client";
import { chooseTemplate, loadComfySettings, loadCustomWorkflows, parseSeed, templateOptionsFor } from "../comfyui/settings";
import { fillWorkflow, PlaceholderValues, randomSeed, REFERENCE_PLACEHOLDERS, sizeForAspectRatio } from "../comfyui/workflow";

// A local ComfyUI server (#39). Everything the adapter needs (server URL,
// template, checkpoint, LoRA) comes from the ComfyUI settings in
// localStorage (comfyui/settings.ts), so it takes no API key or base URL from
// the app's provider config. The flow is ComfyUI's own HTTP API: upload the
// reference photo(s), queue the filled workflow, poll its history until
// outputs appear, then download each image as a data: URL.

export interface ComfyUIAdapterOptions {
  pollIntervalMs?: number;
  // FLUX on Apple Silicon can take many minutes, and the prompt may wait
  // behind others in ComfyUI's queue, so the default is generous.
  timeoutMs?: number;
}

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

// The same photo always gets the same name, so repeated pictures of one
// character reuse ComfyUI's copy instead of filling its input folder.
const hashData = (data: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const referenceFileName = (image: NormalizedImage): string =>
  `whatsgemini-ref-${hashData(image.data)}-${image.data.length.toString(36)}.${EXTENSIONS[image.mimeType] || "png"}`;

const makeClientId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `whatsgemini-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// The replying character's photos come first in referenceImages. In a group
// picture referenceCharacters may be all there is; its first entry is still
// the replying character.
const pickReferences = (opts: ImageGenCallOptions): NormalizedImage[] => {
  if (opts.referenceImages && opts.referenceImages.length > 0) return opts.referenceImages;
  return opts.referenceCharacters?.flatMap((c) => c.images) || [];
};

export const createComfyUIAdapter = (adapterOptions: ComfyUIAdapterOptions = {}): ImageProviderAdapter => {
  const pollIntervalMs = adapterOptions.pollIntervalMs ?? 1000;
  const timeoutMs = adapterOptions.timeoutMs ?? 20 * 60 * 1000;
  const clientId = makeClientId();

  const generateImage = async (opts: ImageGenCallOptions): Promise<ImageGenCallResult> => {
    const settings = loadComfySettings();
    const serverUrl = normalizeServerUrl(settings.serverUrl);
    const references = pickReferences(opts);
    const template = chooseTemplate(settings, references.length > 0, loadCustomWorkflows());
    const options = templateOptionsFor(settings, template);
    const { width, height } = sizeForAspectRatio(opts.aspectRatio, settings.baseSize || 1024);

    const values: PlaceholderValues = {
      positivePrompt: template.promptFormat ? template.promptFormat.replace("{prompt}", opts.prompt) : opts.prompt,
      negativePrompt: settings.negativePrompt,
      seed: parseSeed(settings.seed) ?? randomSeed(),
      width,
      height,
      lora: options.lora,
      loraStrength: options.loraStrength,
    };
    if (options.checkpoint) values.checkpoint = options.checkpoint;

    // Upload only as many photos as the template has reference slots for.
    const slots = REFERENCE_PLACEHOLDERS.filter((p) => template.mappings.some((m) => m.placeholder === p));
    for (let i = 0; i < slots.length && i < references.length; i++) {
      const ref = references[i];
      values[slots[i]] = await uploadImage(serverUrl, ref.data, ref.mimeType, referenceFileName(ref), opts.signal);
    }

    const workflow = fillWorkflow(template.workflow, template.mappings, values);
    const promptId = await queuePrompt(serverUrl, workflow, clientId, opts.signal);
    try {
      const outputs = await waitForOutputs(serverUrl, promptId, { signal: opts.signal, pollIntervalMs, timeoutMs });
      const images = await Promise.all(outputs.map((o) => fetchOutputImage(serverUrl, o, opts.signal)));
      return { images };
    } catch (err) {
      if (opts.signal?.aborted) void cancelPrompt(serverUrl, promptId);
      throw err;
    }
  };

  return {
    id: "comfyui",
    capabilities: { requiresApiKey: false, requiresBaseUrl: false },
    generateImage,
  };
};

export const comfyuiAdapter = createComfyUIAdapter();
