import type { ComfyWorkflow, PlaceholderMapping } from "./workflow";

// The workflows the app ships, in ComfyUI's API format. Each one lists the
// custom nodes and model files it needs, which Settings shows and checks
// against the server ("Test connection").
//
// Model file names below are the common downloads; any file of the same kind
// works once it's picked in Settings. Folders are relative to ComfyUI/models/.

export interface CustomNodePack {
  name: string;
  url: string;
  // Node classes the template uses from this pack, looked up with
  // GET /object_info/{class} to tell whether the pack is installed.
  classTypes: string[];
}

export interface ModelSource {
  // The loader class and input whose dropdown lists the files this
  // placeholder can take (read from GET /object_info/{class}).
  classType: string;
  input: string;
}

export interface WorkflowTemplate {
  id: string;
  label: string;
  description: string;
  workflow: ComfyWorkflow;
  mappings: PlaceholderMapping[];
  // How the scene prompt is worded for this model; "{prompt}" is replaced.
  promptFormat?: string;
  defaultCheckpoint: string;
  defaultLoraStrength: number;
  checkpointSource?: ModelSource;
  loraSource?: ModelSource;
  requirements: {
    customNodes: CustomNodePack[];
    models: string[];
    vram: string;
  };
}

const IPADAPTER_PLUS: CustomNodePack = {
  name: "ComfyUI_IPAdapter_plus",
  url: "https://github.com/cubiq/ComfyUI_IPAdapter_plus",
  classTypes: ["IPAdapterUnifiedLoaderFaceID", "IPAdapterFaceID"],
};

const COMFYUI_GGUF: CustomNodePack = {
  name: "ComfyUI-GGUF",
  url: "https://github.com/city96/ComfyUI-GGUF",
  classTypes: ["UnetLoaderGGUF"],
};

const REACTOR: CustomNodePack = {
  name: "ComfyUI-ReActor",
  url: "https://github.com/Gourieff/ComfyUI-ReActor",
  classTypes: ["ReActorFaceSwap"],
};

const SDXL_CHECKPOINT = "sd_xl_base_1.0.safetensors";
const SAVE_PREFIX = "Kindred";

const CHECKPOINT_SOURCE: ModelSource = { classType: "CheckpointLoaderSimple", input: "ckpt_name" };
const LORA_SOURCE: ModelSource = { classType: "LoraLoader", input: "lora_name" };
const UNET_SOURCE: ModelSource = { classType: "UNETLoader", input: "unet_name" };
const MODEL_ONLY_LORA_SOURCE: ModelSource = { classType: "LoraLoaderModelOnly", input: "lora_name" };

// The SDXL text-to-image graph that (a), (c) and (d) build on:
// checkpoint -> optional LoRA -> prompts -> KSampler -> decode -> save.
const sdxlBase = (modelLink: [string, number]): ComfyWorkflow => ({
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: SDXL_CHECKPOINT }, _meta: { title: "Checkpoint" } },
  "2": {
    class_type: "LoraLoader",
    inputs: { lora_name: "", strength_model: 0.8, strength_clip: 0.8, model: ["1", 0], clip: ["1", 1] },
    _meta: { title: "Character LoRA (optional)" },
  },
  "3": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 1] }, _meta: { title: "Prompt" } },
  "4": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 1] }, _meta: { title: "Negative prompt" } },
  "5": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 }, _meta: { title: "Size" } },
  "6": {
    class_type: "KSampler",
    inputs: {
      seed: 0,
      steps: 28,
      cfg: 6,
      sampler_name: "dpmpp_2m",
      scheduler: "karras",
      denoise: 1,
      model: modelLink,
      positive: ["3", 0],
      negative: ["4", 0],
      latent_image: ["5", 0],
    },
  },
  "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
});

const sdxlMappings: PlaceholderMapping[] = [
  { placeholder: "checkpoint", nodeId: "1", input: "ckpt_name" },
  { placeholder: "lora", nodeId: "2", input: "lora_name" },
  { placeholder: "loraStrength", nodeId: "2", input: "strength_model" },
  { placeholder: "loraStrength", nodeId: "2", input: "strength_clip" },
  { placeholder: "positivePrompt", nodeId: "3", input: "text" },
  { placeholder: "negativePrompt", nodeId: "4", input: "text" },
  { placeholder: "width", nodeId: "5", input: "width" },
  { placeholder: "height", nodeId: "5", input: "height" },
  { placeholder: "seed", nodeId: "6", input: "seed" },
];

// (c) Plain text to image. Core nodes only; any SDXL, Illustrious or Pony
// checkpoint (or SD 1.5 with a 512 base size).
const sdxlTxt2img: WorkflowTemplate = {
  id: "sdxl-txt2img",
  label: "SDXL text to image",
  description: "No reference: a plain SDXL / Illustrious / Pony picture from the prompt. Used when the character has no reference photo.",
  workflow: {
    ...sdxlBase(["2", 0]),
    "8": { class_type: "SaveImage", inputs: { filename_prefix: SAVE_PREFIX, images: ["7", 0] } },
  },
  mappings: sdxlMappings,
  defaultCheckpoint: SDXL_CHECKPOINT,
  defaultLoraStrength: 0.8,
  checkpointSource: CHECKPOINT_SOURCE,
  loraSource: LORA_SOURCE,
  requirements: {
    customNodes: [],
    models: ["checkpoints/ an SDXL, Illustrious or Pony checkpoint (e.g. sd_xl_base_1.0.safetensors)", "loras/ your character LoRA (optional)"],
    vram: "about 6-8 GB",
  },
};

// (a) SDXL + IP-Adapter FaceID Plus V2 from the main reference photo, with an
// optional character LoRA. The unified loader picks the FaceID model, its
// LoRA and the CLIP Vision encoder by preset, so their file names must match
// what ComfyUI_IPAdapter_plus expects. FaceID also needs the insightface
// Python package in ComfyUI's environment (pip install insightface
// onnxruntime) and the buffalo_l / antelopev2 face models it downloads.
// The FaceID weight and LoRA strength below are only fallbacks: the adapter
// fills them per art style (faceIdOptionsFor in settings.ts), since FaceID
// learned real faces and pulls anime faces toward a semi-real look at 0.85.
const sdxlFaceId: WorkflowTemplate = {
  id: "sdxl-faceid",
  label: "SDXL + IP-Adapter FaceID",
  description: "Keeps the face from the character's main reference photo (FaceID Plus V2). Works with any SDXL, Illustrious or Pony checkpoint and an optional character LoRA.",
  workflow: {
    ...sdxlBase(["11", 0]),
    "8": { class_type: "SaveImage", inputs: { filename_prefix: SAVE_PREFIX, images: ["7", 0] } },
    "9": { class_type: "LoadImage", inputs: { image: "" }, _meta: { title: "Reference photo" } },
    "10": {
      class_type: "IPAdapterUnifiedLoaderFaceID",
      inputs: { preset: "FACEID PLUS V2", lora_strength: 0.6, provider: "CPU", model: ["2", 0] },
    },
    "11": {
      class_type: "IPAdapterFaceID",
      inputs: {
        weight: 0.85,
        weight_faceidv2: 1,
        weight_type: "linear",
        combine_embeds: "concat",
        start_at: 0,
        end_at: 1,
        embeds_scaling: "V only",
        model: ["10", 0],
        ipadapter: ["10", 1],
        image: ["9", 0],
      },
    },
  },
  mappings: [
    ...sdxlMappings,
    { placeholder: "referenceImage", nodeId: "9", input: "image" },
    { placeholder: "faceIdWeight", nodeId: "11", input: "weight" },
    { placeholder: "faceIdLoraStrength", nodeId: "10", input: "lora_strength" },
  ],
  defaultCheckpoint: SDXL_CHECKPOINT,
  defaultLoraStrength: 0.8,
  checkpointSource: CHECKPOINT_SOURCE,
  loraSource: LORA_SOURCE,
  requirements: {
    customNodes: [IPADAPTER_PLUS],
    models: [
      "checkpoints/ an SDXL, Illustrious or Pony checkpoint",
      "ipadapter/ ip-adapter-faceid-plusv2_sdxl.bin",
      "loras/ ip-adapter-faceid-plusv2_sdxl_lora.safetensors",
      "clip_vision/ CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors",
      "insightface (pip install insightface onnxruntime; buffalo_l is fetched on first use)",
    ],
    vram: "about 8 GB",
  },
};

// (b) FLUX.1 Kontext dev, quantized to GGUF, editing from the main reference
// photo: the reference is encoded and attached to the prompt's conditioning
// (ReferenceLatent), and a fresh latent sets the output size. Kontext reads
// the prompt as an instruction, hence the wording below. cfg stays at 1, so
// the negative prompt has no effect and is zeroed out.
const fluxKontext: WorkflowTemplate = {
  id: "flux-kontext-gguf",
  label: "FLUX.1 Kontext dev (GGUF)",
  description: "Redraws the character from the main reference photo in the new scene. Best likeness, but slow and heavier on memory.",
  workflow: {
    "1": { class_type: "UnetLoaderGGUF", inputs: { unet_name: "flux1-kontext-dev-Q4_K_M.gguf" }, _meta: { title: "Kontext model" } },
    "2": {
      class_type: "LoraLoaderModelOnly",
      inputs: { lora_name: "", strength_model: 1, model: ["1", 0] },
      _meta: { title: "FLUX LoRA (optional)" },
    },
    "3": {
      class_type: "DualCLIPLoader",
      inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn_scaled.safetensors", type: "flux" },
    },
    "4": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
    "5": { class_type: "LoadImage", inputs: { image: "" }, _meta: { title: "Reference photo" } },
    "6": { class_type: "FluxKontextImageScale", inputs: { image: ["5", 0] } },
    "7": { class_type: "VAEEncode", inputs: { pixels: ["6", 0], vae: ["4", 0] } },
    "8": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["3", 0] }, _meta: { title: "Prompt" } },
    "9": { class_type: "ReferenceLatent", inputs: { conditioning: ["8", 0], latent: ["7", 0] } },
    "10": { class_type: "FluxGuidance", inputs: { guidance: 2.5, conditioning: ["9", 0] } },
    "11": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["8", 0] } },
    "12": { class_type: "EmptySD3LatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 }, _meta: { title: "Size" } },
    "13": {
      class_type: "KSampler",
      inputs: {
        seed: 0,
        steps: 20,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1,
        model: ["2", 0],
        positive: ["10", 0],
        negative: ["11", 0],
        latent_image: ["12", 0],
      },
    },
    "14": { class_type: "VAEDecode", inputs: { samples: ["13", 0], vae: ["4", 0] } },
    "15": { class_type: "SaveImage", inputs: { filename_prefix: SAVE_PREFIX, images: ["14", 0] } },
  },
  mappings: [
    { placeholder: "checkpoint", nodeId: "1", input: "unet_name" },
    { placeholder: "lora", nodeId: "2", input: "lora_name" },
    { placeholder: "loraStrength", nodeId: "2", input: "strength_model" },
    { placeholder: "referenceImage", nodeId: "5", input: "image" },
    { placeholder: "positivePrompt", nodeId: "8", input: "text" },
    { placeholder: "width", nodeId: "12", input: "width" },
    { placeholder: "height", nodeId: "12", input: "height" },
    { placeholder: "seed", nodeId: "13", input: "seed" },
  ],
  promptFormat: "Show the same person as in the reference image, with the same face, identity and hairstyle, in this new picture: {prompt}",
  defaultCheckpoint: "flux1-kontext-dev-Q4_K_M.gguf",
  defaultLoraStrength: 1,
  checkpointSource: { classType: "UnetLoaderGGUF", input: "unet_name" },
  loraSource: { classType: "LoraLoaderModelOnly", input: "lora_name" },
  requirements: {
    customNodes: [COMFYUI_GGUF],
    models: [
      "unet/ flux1-kontext-dev-Q4_K_M.gguf (or another quant from QuantStack/FLUX.1-Kontext-dev-GGUF)",
      "text_encoders/ clip_l.safetensors",
      "text_encoders/ t5xxl_fp8_e4m3fn_scaled.safetensors",
      "vae/ ae.safetensors",
      "Needs a recent ComfyUI (FluxKontextImageScale and ReferenceLatent are core nodes since mid-2025).",
    ],
    vram: "about 12 GB (less with a Q3 quant); slow on Apple Silicon",
  },
};

// (d) Plain SDXL text to image, then ReActor swaps in the face from the main
// reference photo and restores it with CodeFormer. Faster than FaceID and
// keeps the checkpoint's style, but only the face (not hair or build) carries
// over.
const sdxlReactor: WorkflowTemplate = {
  id: "sdxl-reactor",
  label: "SDXL + ReActor face swap",
  description: "Draws the picture from the prompt, then swaps in the face from the main reference photo.",
  workflow: {
    ...sdxlBase(["2", 0]),
    "9": { class_type: "LoadImage", inputs: { image: "" }, _meta: { title: "Reference photo" } },
    "10": {
      class_type: "ReActorFaceSwap",
      inputs: {
        enabled: true,
        input_image: ["7", 0],
        source_image: ["9", 0],
        swap_model: "inswapper_128.onnx",
        facedetection: "retinaface_resnet50",
        face_restore_model: "codeformer-v0.1.0.pth",
        face_restore_visibility: 1,
        codeformer_weight: 0.5,
        detect_gender_input: "no",
        detect_gender_source: "no",
        input_faces_index: "0",
        source_faces_index: "0",
        console_log_level: 1,
      },
    },
    "8": { class_type: "SaveImage", inputs: { filename_prefix: SAVE_PREFIX, images: ["10", 0] } },
  },
  mappings: [...sdxlMappings, { placeholder: "referenceImage", nodeId: "9", input: "image" }],
  defaultCheckpoint: SDXL_CHECKPOINT,
  defaultLoraStrength: 0.8,
  checkpointSource: CHECKPOINT_SOURCE,
  loraSource: LORA_SOURCE,
  requirements: {
    customNodes: [REACTOR],
    models: [
      "checkpoints/ an SDXL, Illustrious or Pony checkpoint",
      "insightface/ inswapper_128.onnx",
      "facerestore_models/ codeformer-v0.1.0.pth",
    ],
    vram: "about 8 GB",
  },
};

// (e) FLUX.2 Klein 4B (distilled), from ComfyUI's official Klein template:
// an edit model that redraws the person in the main reference photo in a new
// scene, in seconds. The reference is encoded and attached to both the
// prompt and the zeroed-out negative (ReferenceLatent). It runs at cfg 1, so
// there is no negative prompt. Flux2Scheduler sizes its sigmas by the
// picture, so it gets the same width and height as the latent.
const flux2Klein: WorkflowTemplate = {
  id: "flux2-klein-4b-reference",
  label: "FLUX.2 Klein 4B (reference photo)",
  description: "Redraws the character from the main reference photo in the new scene. Fast (seconds) and keeps the likeness; reads prompts as plain sentences.",
  workflow: {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "flux-2-klein-4b-fp8.safetensors", weight_dtype: "default" }, _meta: { title: "Klein model" } },
    "2": {
      class_type: "LoraLoaderModelOnly",
      inputs: { lora_name: "", strength_model: 1, model: ["1", 0] },
      _meta: { title: "Klein LoRA (optional)" },
    },
    "3": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b.safetensors", type: "flux2", device: "default" } },
    "4": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } },
    "5": { class_type: "LoadImage", inputs: { image: "" }, _meta: { title: "Reference photo" } },
    "6": { class_type: "ImageScaleToTotalPixels", inputs: { image: ["5", 0], upscale_method: "lanczos", megapixels: 1, resolution_steps: 1 } },
    "7": { class_type: "VAEEncode", inputs: { pixels: ["6", 0], vae: ["4", 0] } },
    "8": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["3", 0] }, _meta: { title: "Prompt" } },
    "9": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["8", 0] } },
    "10": { class_type: "ReferenceLatent", inputs: { conditioning: ["8", 0], latent: ["7", 0] } },
    "11": { class_type: "ReferenceLatent", inputs: { conditioning: ["9", 0], latent: ["7", 0] } },
    "12": { class_type: "EmptyFlux2LatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 }, _meta: { title: "Size" } },
    "13": { class_type: "Flux2Scheduler", inputs: { steps: 4, width: 1024, height: 1024 } },
    "14": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "15": { class_type: "RandomNoise", inputs: { noise_seed: 0 } },
    "16": { class_type: "CFGGuider", inputs: { model: ["2", 0], positive: ["10", 0], negative: ["11", 0], cfg: 1 } },
    "17": {
      class_type: "SamplerCustomAdvanced",
      inputs: { noise: ["15", 0], guider: ["16", 0], sampler: ["14", 0], sigmas: ["13", 0], latent_image: ["12", 0] },
    },
    "18": { class_type: "VAEDecode", inputs: { samples: ["17", 0], vae: ["4", 0] } },
    "19": { class_type: "SaveImage", inputs: { filename_prefix: SAVE_PREFIX, images: ["18", 0] } },
  },
  mappings: [
    { placeholder: "checkpoint", nodeId: "1", input: "unet_name" },
    { placeholder: "lora", nodeId: "2", input: "lora_name" },
    { placeholder: "loraStrength", nodeId: "2", input: "strength_model" },
    { placeholder: "referenceImage", nodeId: "5", input: "image" },
    { placeholder: "positivePrompt", nodeId: "8", input: "text" },
    { placeholder: "width", nodeId: "12", input: "width" },
    { placeholder: "height", nodeId: "12", input: "height" },
    { placeholder: "width", nodeId: "13", input: "width" },
    { placeholder: "height", nodeId: "13", input: "height" },
    { placeholder: "seed", nodeId: "15", input: "noise_seed" },
  ],
  // Klein reads the prompt as an edit instruction; without the first part a
  // scene can come out as only the photo's background changed.
  promptFormat: "Keep the person from image 1 the same: same face, identity, hairstyle and body. Show them in this new picture: {prompt}",
  defaultCheckpoint: "flux-2-klein-4b-fp8.safetensors",
  defaultLoraStrength: 1,
  checkpointSource: UNET_SOURCE,
  loraSource: MODEL_ONLY_LORA_SOURCE,
  requirements: {
    customNodes: [],
    models: [
      "diffusion_models/ flux-2-klein-4b-fp8.safetensors",
      "text_encoders/ qwen_3_4b.safetensors",
      "vae/ flux2-vae.safetensors",
      "Needs a recent ComfyUI (EmptyFlux2LatentImage and Flux2Scheduler are core nodes).",
    ],
    vram: "about 8-10 GB",
  },
};

// (f) Z-Image Turbo text to image, from ComfyUI's official Z-Image template:
// 8 steps at cfg 1, so the negative prompt is zeroed out and not used.
const zImageTurbo: WorkflowTemplate = {
  id: "z-image-turbo-txt2img",
  label: "Z-Image Turbo text to image",
  description: "No reference: a fast photoreal picture from the prompt, written as plain sentences. Used when the character has no reference photo.",
  workflow: {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "z_image_turbo_bf16.safetensors", weight_dtype: "default" }, _meta: { title: "Z-Image model" } },
    "2": {
      class_type: "LoraLoaderModelOnly",
      inputs: { lora_name: "", strength_model: 1, model: ["1", 0] },
      _meta: { title: "Z-Image LoRA (optional)" },
    },
    "3": { class_type: "ModelSamplingAuraFlow", inputs: { model: ["2", 0], shift: 3 } },
    "4": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b.safetensors", type: "lumina2", device: "default" } },
    "5": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["4", 0] }, _meta: { title: "Prompt" } },
    "7": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["6", 0] } },
    "8": { class_type: "EmptySD3LatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 }, _meta: { title: "Size" } },
    "9": {
      class_type: "KSampler",
      inputs: {
        seed: 0,
        steps: 8,
        cfg: 1,
        sampler_name: "res_multistep",
        scheduler: "simple",
        denoise: 1,
        model: ["3", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["8", 0],
      },
    },
    "10": { class_type: "VAEDecode", inputs: { samples: ["9", 0], vae: ["5", 0] } },
    "11": { class_type: "SaveImage", inputs: { filename_prefix: SAVE_PREFIX, images: ["10", 0] } },
  },
  mappings: [
    { placeholder: "checkpoint", nodeId: "1", input: "unet_name" },
    { placeholder: "lora", nodeId: "2", input: "lora_name" },
    { placeholder: "loraStrength", nodeId: "2", input: "strength_model" },
    { placeholder: "positivePrompt", nodeId: "6", input: "text" },
    { placeholder: "width", nodeId: "8", input: "width" },
    { placeholder: "height", nodeId: "8", input: "height" },
    { placeholder: "seed", nodeId: "9", input: "seed" },
  ],
  defaultCheckpoint: "z_image_turbo_bf16.safetensors",
  defaultLoraStrength: 1,
  checkpointSource: UNET_SOURCE,
  loraSource: MODEL_ONLY_LORA_SOURCE,
  requirements: {
    customNodes: [],
    models: ["diffusion_models/ z_image_turbo_bf16.safetensors", "text_encoders/ qwen_3_4b.safetensors", "vae/ ae.safetensors"],
    vram: "about 10-12 GB",
  },
};

// Klein and Z-Image are the defaults: fast and photoreal. The SDXL templates
// stay for anime and explicit pictures, with the checkpoints for those.
export const BUILT_IN_TEMPLATES: WorkflowTemplate[] = [flux2Klein, zImageTurbo, sdxlFaceId, fluxKontext, sdxlReactor, sdxlTxt2img];

export const DEFAULT_REFERENCE_TEMPLATE_ID = flux2Klein.id;
export const DEFAULT_TEXT_TEMPLATE_ID = zImageTurbo.id;
