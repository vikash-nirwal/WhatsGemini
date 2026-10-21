import { BUILT_IN_TEMPLATES, DEFAULT_REFERENCE_TEMPLATE_ID, DEFAULT_TEXT_TEMPLATE_ID, WorkflowTemplate } from "./templates";
import { ComfyWorkflow, PlaceholderMapping, usesReference } from "./workflow";

// ComfyUI keeps its own settings in localStorage, under its own keys, rather
// than in the Redux settings slice: the adapter reads them at call time, so
// nothing in aiSlice has to pass them through. Imported workflows get a key
// of their own so one oversized import can't break parsing the rest.
export const LS_COMFYUI_SETTINGS = "comfyui_settings";
export const LS_COMFYUI_CUSTOM_WORKFLOWS = "comfyui_custom_workflows";

export const DEFAULT_COMFYUI_URL = "http://127.0.0.1:8188";
export const DEFAULT_NEGATIVE_PROMPT =
  "lowres, bad anatomy, bad hands, extra fingers, missing fingers, deformed face, blurry, jpeg artifacts, watermark, signature, text";

export interface TemplateOptions {
  checkpoint?: string;
  lora?: string;
  loraStrength?: number;
}

export interface ComfyUISettings {
  serverUrl: string;
  // Used when the character has a reference photo, and when it has none.
  referenceTemplateId: string;
  textTemplateId: string;
  // 1024 for SDXL and FLUX, 512 or 768 for SD 1.5.
  baseSize: number;
  negativePrompt: string;
  // Empty means a new random seed for every picture.
  seed: string;
  // Per template, since an SDXL checkpoint or LoRA means nothing to FLUX.
  templateOptions: Record<string, TemplateOptions>;
}

export interface CustomWorkflow {
  id: string; // always starts with CUSTOM_PREFIX
  name: string;
  workflow: ComfyWorkflow;
  mappings: PlaceholderMapping[];
}

export const CUSTOM_PREFIX = "custom:";

// A character's reference mode (#40), set in the character editor in SD
// WebUI terms, picks the matching bundled template.
export const REFERENCE_MODE_TEMPLATES: Record<string, string> = {
  controlnet: "sdxl-faceid",
  reactor: "sdxl-reactor",
  img2img: "flux-kontext-gguf",
};

export const DEFAULT_COMFYUI_SETTINGS: ComfyUISettings = {
  serverUrl: DEFAULT_COMFYUI_URL,
  referenceTemplateId: DEFAULT_REFERENCE_TEMPLATE_ID,
  textTemplateId: DEFAULT_TEXT_TEMPLATE_ID,
  baseSize: 1024,
  negativePrompt: DEFAULT_NEGATIVE_PROMPT,
  seed: "",
  templateOptions: {},
};

const readJson = <T>(key: string): T | undefined => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
};

export const loadComfySettings = (): ComfyUISettings => {
  const stored = readJson<Partial<ComfyUISettings>>(LS_COMFYUI_SETTINGS) || {};
  return {
    ...DEFAULT_COMFYUI_SETTINGS,
    ...stored,
    templateOptions: { ...(stored.templateOptions || {}) },
  };
};

export const saveComfySettings = (settings: ComfyUISettings): void => {
  localStorage.setItem(LS_COMFYUI_SETTINGS, JSON.stringify(settings));
};

export const loadCustomWorkflows = (): CustomWorkflow[] => {
  const stored = readJson<CustomWorkflow[]>(LS_COMFYUI_CUSTOM_WORKFLOWS);
  return Array.isArray(stored) ? stored.filter((w) => w && typeof w.id === "string" && w.workflow) : [];
};

export const saveCustomWorkflows = (workflows: CustomWorkflow[]): void => {
  localStorage.setItem(LS_COMFYUI_CUSTOM_WORKFLOWS, JSON.stringify(workflows));
};

export const newCustomWorkflowId = (): string =>
  `${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// An imported workflow behaves like a bundled template, with its loader
// dropdowns taken from whichever node its checkpoint and LoRA are mapped to.
export const customToTemplate = (custom: CustomWorkflow): WorkflowTemplate => {
  const sourceOf = (placeholder: "checkpoint" | "lora") => {
    const mapping = custom.mappings.find((m) => m.placeholder === placeholder);
    const node = mapping && custom.workflow[mapping.nodeId];
    return node && mapping ? { classType: node.class_type, input: mapping.input } : undefined;
  };
  const checkpointMapping = custom.mappings.find((m) => m.placeholder === "checkpoint");
  const savedCheckpoint = checkpointMapping && custom.workflow[checkpointMapping.nodeId]?.inputs[checkpointMapping.input];
  return {
    id: custom.id,
    label: custom.name,
    description: usesReference(custom.mappings) ? "Imported workflow, uses the reference photo." : "Imported workflow.",
    workflow: custom.workflow,
    mappings: custom.mappings,
    defaultCheckpoint: typeof savedCheckpoint === "string" ? savedCheckpoint : "",
    defaultLoraStrength: 0.8,
    checkpointSource: sourceOf("checkpoint"),
    loraSource: sourceOf("lora"),
    requirements: { customNodes: [], models: [], vram: "" },
  };
};

export const allTemplates = (customs: CustomWorkflow[] = loadCustomWorkflows()): WorkflowTemplate[] => [
  ...BUILT_IN_TEMPLATES,
  ...customs.map(customToTemplate),
];

export const findTemplate = (id: string, customs?: CustomWorkflow[]): WorkflowTemplate | undefined =>
  allTemplates(customs).find((t) => t.id === id);

// With a reference photo: the reference template (which may also be a
// text-only one, if the user wants references ignored). Without one: the
// text template, unless it needs a reference after all, in which case the
// bundled text-to-image template stands in, since an empty LoadImage would
// only fail on the server.
export const chooseTemplate = (
  settings: ComfyUISettings,
  hasReference: boolean,
  customs?: CustomWorkflow[]
): WorkflowTemplate => {
  const fallbackText = findTemplate(DEFAULT_TEXT_TEMPLATE_ID, [])!;
  if (hasReference) {
    return findTemplate(settings.referenceTemplateId, customs) || findTemplate(DEFAULT_REFERENCE_TEMPLATE_ID, [])!;
  }
  const text = findTemplate(settings.textTemplateId, customs);
  return text && !usesReference(text.mappings) ? text : fallbackText;
};

export const templateOptionsFor = (settings: ComfyUISettings, template: WorkflowTemplate): Required<TemplateOptions> => {
  const opts = settings.templateOptions[template.id] || {};
  return {
    checkpoint: opts.checkpoint?.trim() || template.defaultCheckpoint,
    lora: opts.lora?.trim() || "",
    loraStrength: typeof opts.loraStrength === "number" && Number.isFinite(opts.loraStrength) ? opts.loraStrength : template.defaultLoraStrength,
  };
};

export const parseSeed = (seed: string): number | undefined => {
  const trimmed = seed.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : undefined;
};
