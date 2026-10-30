// fal.ai's SDXL endpoint that runs any checkpoint (the user's ask,
// 2026-10-30): the base model and LoRAs are links fal downloads from, a
// Hugging Face ID or a direct file URL, or a file uploaded to fal's storage.
// https://fal.ai/models/fal-ai/lora/api
export const FAL_LORA_ENDPOINT = "fal-ai/lora";
const LS_FAL_LORA = "fal_lora_settings";

export interface FalLora {
  path: string; // a Hugging Face ID, a direct link, or fal's storage URL after an upload
  scale: number; // 0-1, how strongly it applies
  name?: string; // the uploaded file's name, shown instead of fal's storage URL
}

export interface FalLoraSettings {
  checkpoint: string;
  loras: FalLora[];
  negativePrompt: string;
  keepFace: boolean; // the character's photo through IP-Adapter, to keep their face
}

export const DEFAULT_NEGATIVE_PROMPT = "lowres, worst quality, low quality, bad anatomy, bad hands, extra fingers, missing fingers, deformed, blurry, watermark, signature, text";

export const DEFAULT_FAL_LORA: FalLoraSettings = { checkpoint: "", loras: [], negativePrompt: DEFAULT_NEGATIVE_PROMPT, keepFace: true };

export const loadFalLora = (): FalLoraSettings => {
  try {
    const raw = localStorage.getItem(LS_FAL_LORA);
    return raw ? { ...DEFAULT_FAL_LORA, ...JSON.parse(raw) } : DEFAULT_FAL_LORA;
  } catch {
    return DEFAULT_FAL_LORA;
  }
};

export const saveFalLora = (settings: FalLoraSettings) => {
  try {
    localStorage.setItem(LS_FAL_LORA, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: the fields still work until the page closes.
  }
};

// The common SDXL face IP-Adapter (h94/IP-Adapter, "plus face"). Strong
// enough to keep the face without copying the photo's pose or clothes.
const FACE_ADAPTER = {
  path: "h94/IP-Adapter",
  model_subfolder: "sdxl_models",
  weight_name: "ip-adapter-plus-face_sdxl_vit-h.safetensors",
  scale: 0.6,
};

export const buildFalLoraInput = (settings: FalLoraSettings, prompt: string, size: Record<string, string>, faceUrl?: string): Record<string, unknown> => {
  const checkpoint = settings.checkpoint.trim();
  if (!checkpoint) throw new Error("Add a checkpoint for fal.ai's SDXL model in Settings › Images and voice.");
  const loras = settings.loras.filter((l) => l.path.trim()).map((l) => ({ path: l.path.trim(), scale: l.scale }));
  return {
    model_name: checkpoint,
    prompt,
    negative_prompt: settings.negativePrompt.trim(),
    ...(loras.length ? { loras } : {}),
    ...size,
    num_inference_steps: 30,
    guidance_scale: 6,
    scheduler: "DPM++ 2M Karras",
    // Lifts SDXL's 77-token limit, so long tag prompts aren't cut off.
    prompt_weighting: true,
    image_format: "png",
    ...(faceUrl && settings.keepFace
      ? { ip_adapter: [{ ...FACE_ADAPTER, ip_adapter_image_url: faceUrl }], image_encoder_path: "h94/IP-Adapter", image_encoder_subfolder: "models/image_encoder" }
      : {}),
  };
};
