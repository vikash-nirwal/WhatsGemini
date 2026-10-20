// ComfyUI workflows in "API format" (what ComfyUI's "Export (API)" menu item
// saves and what POST /prompt expects): an object keyed by node id, where each
// node names its class and its inputs. An input is either a literal value or
// a link to another node's output, written as [sourceNodeId, outputIndex].
//
// The app never edits a workflow by hand. Each template (bundled or imported)
// carries a list of mappings that say which node input receives which
// placeholder (the prompt, the seed, the uploaded reference image...), and
// fillWorkflow writes the values into a copy right before it is queued.

export type ComfyLink = [string, number];

export interface ComfyNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

export type ComfyWorkflow = Record<string, ComfyNode>;

export const PLACEHOLDERS = [
  "positivePrompt",
  "negativePrompt",
  "seed",
  "width",
  "height",
  "checkpoint",
  "lora",
  "loraStrength",
  "referenceImage",
  "referenceImage2",
  "referenceImage3",
] as const;

export type Placeholder = (typeof PLACEHOLDERS)[number];

export const PLACEHOLDER_LABELS: Record<Placeholder, string> = {
  positivePrompt: "Prompt",
  negativePrompt: "Negative prompt",
  seed: "Seed",
  width: "Width",
  height: "Height",
  checkpoint: "Checkpoint / model",
  lora: "LoRA name",
  loraStrength: "LoRA weight",
  referenceImage: "Reference image (main)",
  referenceImage2: "Reference image 2",
  referenceImage3: "Reference image 3",
};

export const REFERENCE_PLACEHOLDERS: Placeholder[] = ["referenceImage", "referenceImage2", "referenceImage3"];

export interface PlaceholderMapping {
  placeholder: Placeholder;
  nodeId: string;
  input: string;
}

export type PlaceholderValues = Partial<Record<Placeholder, string | number>>;

export const isLink = (value: unknown): value is ComfyLink =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number";

// A LoRA is optional in every template, but a LoraLoader with an empty name
// fails validation. So when no LoRA is set, the loader node is removed and
// whatever read its outputs is wired to its inputs instead. This table says
// which input each output passes through, per known loader class.
const LORA_PASSTHROUGH: Record<string, Record<number, string>> = {
  LoraLoader: { 0: "model", 1: "clip" },
  LoraLoaderModelOnly: { 0: "model" },
};

export const bypassNode = (workflow: ComfyWorkflow, nodeId: string, passthrough: Record<number, string>): void => {
  const node = workflow[nodeId];
  if (!node) return;
  for (const [otherId, other] of Object.entries(workflow)) {
    if (otherId === nodeId) continue;
    for (const [inputName, value] of Object.entries(other.inputs)) {
      if (!isLink(value) || value[0] !== nodeId) continue;
      const sourceInput = passthrough[value[1]];
      if (!sourceInput || node.inputs[sourceInput] === undefined) {
        throw new Error(`Can't skip node ${nodeId} (${node.class_type}): nothing to pass through for output ${value[1]}.`);
      }
      other.inputs[inputName] = node.inputs[sourceInput];
    }
  }
  delete workflow[nodeId];
};

const NUMERIC_PLACEHOLDERS: Placeholder[] = ["seed", "width", "height", "loraStrength"];

// Returns a filled copy; the template's own workflow object is never changed.
// A missing value leaves the workflow's own value in place, except an empty
// LoRA name, which removes the LoRA loader (see LORA_PASSTHROUGH).
export const fillWorkflow = (
  workflow: ComfyWorkflow,
  mappings: PlaceholderMapping[],
  values: PlaceholderValues
): ComfyWorkflow => {
  const filled: ComfyWorkflow = JSON.parse(JSON.stringify(workflow));
  let active = mappings;

  const lora = values.lora;
  if (lora === undefined || String(lora).trim() === "") {
    const loraNodes = new Set(mappings.filter((m) => m.placeholder === "lora").map((m) => m.nodeId));
    for (const nodeId of Array.from(loraNodes)) {
      const passthrough = filled[nodeId] && LORA_PASSTHROUGH[filled[nodeId].class_type];
      // An unknown loader class is left as the workflow saved it.
      if (!passthrough) continue;
      bypassNode(filled, nodeId, passthrough);
      active = active.filter((m) => m.nodeId !== nodeId);
    }
  }

  for (const mapping of active) {
    const value = values[mapping.placeholder];
    if (value === undefined) continue;
    const node = filled[mapping.nodeId];
    if (!node) {
      throw new Error(`The workflow has no node ${mapping.nodeId} for "${PLACEHOLDER_LABELS[mapping.placeholder]}". Check the workflow's mappings in Settings.`);
    }
    node.inputs[mapping.input] = NUMERIC_PLACEHOLDERS.includes(mapping.placeholder) ? Number(value) : String(value);
  }
  return filled;
};

export const usesReference = (mappings: PlaceholderMapping[]): boolean =>
  mappings.some((m) => m.placeholder === "referenceImage");

// SDXL and FLUX are trained around one megapixel, SD 1.5 around 512x512, and
// every latent side must be a multiple of 64 (8 is the hard minimum, but 64
// keeps to the sizes these models were trained on). So the size keeps the
// base size's pixel count and the requested shape.
export const sizeForAspectRatio = (aspectRatio: string | undefined, baseSize = 1024): { width: number; height: number } => {
  const match = /^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/.exec(aspectRatio || "");
  const ratio = match ? Number(match[1]) / Number(match[2]) : 1;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? Math.min(Math.max(ratio, 0.25), 4) : 1;
  const area = baseSize * baseSize;
  const round64 = (n: number) => Math.max(256, Math.round(n / 64) * 64);
  return { width: round64(Math.sqrt(area * safeRatio)), height: round64(Math.sqrt(area / safeRatio)) };
};

export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 48);

// The UI format ("Save" in ComfyUI) has top-level `nodes` and `links` arrays
// and can't be queued; only the API format can.
export const parseApiWorkflow = (json: string): ComfyWorkflow => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("A ComfyUI API workflow is a JSON object of nodes.");
  }
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.nodes) && Array.isArray(obj.links)) {
    throw new Error('This is a ComfyUI UI workflow. In ComfyUI, use Workflow → Export (API) and import that file instead.');
  }
  const entries = Object.entries(obj);
  if (entries.length === 0) throw new Error("The workflow has no nodes.");
  for (const [id, node] of entries) {
    const n = node as Partial<ComfyNode> | null;
    if (!n || typeof n.class_type !== "string" || !n.inputs || typeof n.inputs !== "object") {
      throw new Error(`Node "${id}" has no class_type or inputs, so this isn't an API-format workflow.`);
    }
  }
  return obj as unknown as ComfyWorkflow;
};

export interface LiteralInput {
  nodeId: string;
  input: string;
  classType: string;
  title?: string;
  value: unknown;
}

// Every input that holds a literal value: the only places a placeholder can go.
export const listLiteralInputs = (workflow: ComfyWorkflow): LiteralInput[] =>
  Object.entries(workflow).flatMap(([nodeId, node]) =>
    Object.entries(node.inputs)
      .filter(([, value]) => !isLink(value))
      .map(([input, value]) => ({ nodeId, input, classType: node.class_type, title: node._meta?.title, value }))
  );

const SAMPLER_CLASSES = ["KSampler", "KSamplerAdvanced", "SamplerCustom"];
const LATENT_CLASSES = ["EmptyLatentImage", "EmptySD3LatentImage", "EmptyHunyuanLatentVideo"];
const CHECKPOINT_INPUTS: Record<string, string> = {
  CheckpointLoaderSimple: "ckpt_name",
  UnetLoaderGGUF: "unet_name",
  UNETLoader: "unet_name",
};

// Follows links back from a sampler's positive/negative input to the text
// encoder that feeds it (through FluxGuidance, ReferenceLatent and the like).
const findTextEncoder = (workflow: ComfyWorkflow, link: unknown, depth = 0): string | undefined => {
  if (!isLink(link) || depth > 8) return undefined;
  const node = workflow[link[0]];
  if (!node) return undefined;
  if (node.class_type.startsWith("CLIPTextEncode") && typeof node.inputs.text === "string") return link[0];
  if (node.class_type === "ConditioningZeroOut") return undefined;
  const next = node.inputs.conditioning ?? node.inputs.positive;
  return findTextEncoder(workflow, next, depth + 1);
};

// A first guess at the mappings for an imported workflow, from the usual
// node classes. The user can correct any of them in Settings.
export const suggestMappings = (workflow: ComfyWorkflow): PlaceholderMapping[] => {
  const mappings: PlaceholderMapping[] = [];
  const add = (placeholder: Placeholder, nodeId: string, input: string) => {
    if (!mappings.some((m) => m.placeholder === placeholder && m.nodeId === nodeId && m.input === input)) {
      mappings.push({ placeholder, nodeId, input });
    }
  };
  const has = (placeholder: Placeholder) => mappings.some((m) => m.placeholder === placeholder);
  const entries = Object.entries(workflow);

  for (const [id, node] of entries) {
    if (!SAMPLER_CLASSES.includes(node.class_type)) continue;
    const seedInput = "seed" in node.inputs ? "seed" : "noise_seed" in node.inputs ? "noise_seed" : undefined;
    if (seedInput && !isLink(node.inputs[seedInput])) add("seed", id, seedInput);
    const pos = findTextEncoder(workflow, node.inputs.positive);
    if (pos && !has("positivePrompt")) add("positivePrompt", pos, "text");
    const neg = findTextEncoder(workflow, node.inputs.negative);
    if (neg && neg !== pos && !has("negativePrompt")) add("negativePrompt", neg, "text");
  }
  for (const [id, node] of entries) {
    if (LATENT_CLASSES.includes(node.class_type) && !has("width")) {
      if (!isLink(node.inputs.width)) add("width", id, "width");
      if (!isLink(node.inputs.height)) add("height", id, "height");
    }
    const ckptInput = CHECKPOINT_INPUTS[node.class_type];
    if (ckptInput && !has("checkpoint")) add("checkpoint", id, ckptInput);
    if (LORA_PASSTHROUGH[node.class_type] && !has("lora")) {
      add("lora", id, "lora_name");
      add("loraStrength", id, "strength_model");
      if ("strength_clip" in node.inputs) add("loraStrength", id, "strength_clip");
    }
  }
  const loadImages = entries.filter(([, node]) => node.class_type === "LoadImage");
  loadImages.slice(0, REFERENCE_PLACEHOLDERS.length).forEach(([id], i) => add(REFERENCE_PLACEHOLDERS[i], id, "image"));
  return mappings;
};
