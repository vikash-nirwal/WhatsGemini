import {
  ComfyWorkflow,
  fillWorkflow,
  isLink,
  listLiteralInputs,
  parseApiWorkflow,
  PlaceholderMapping,
  sizeForAspectRatio,
  suggestMappings,
} from "./workflow";
import { BUILT_IN_TEMPLATES } from "./templates";

const withLora: ComfyWorkflow = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "base.safetensors" } },
  "2": { class_type: "LoraLoader", inputs: { lora_name: "", strength_model: 1, strength_clip: 1, model: ["1", 0], clip: ["1", 1] } },
  "3": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 1] } },
  "4": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 1] } },
  "5": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
  "6": {
    class_type: "KSampler",
    inputs: { seed: 0, model: ["2", 0], positive: ["3", 0], negative: ["4", 0], latent_image: ["5", 0] },
  },
  "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
  "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: "x" } },
};

const mappings: PlaceholderMapping[] = [
  { placeholder: "checkpoint", nodeId: "1", input: "ckpt_name" },
  { placeholder: "lora", nodeId: "2", input: "lora_name" },
  { placeholder: "loraStrength", nodeId: "2", input: "strength_model" },
  { placeholder: "positivePrompt", nodeId: "3", input: "text" },
  { placeholder: "negativePrompt", nodeId: "4", input: "text" },
  { placeholder: "width", nodeId: "5", input: "width" },
  { placeholder: "height", nodeId: "5", input: "height" },
  { placeholder: "seed", nodeId: "6", input: "seed" },
];

describe("fillWorkflow", () => {
  it("writes each value into its mapped input, as a number where ComfyUI wants one", () => {
    const filled = fillWorkflow(withLora, mappings, {
      checkpoint: "juggernaut.safetensors",
      lora: "aria.safetensors",
      loraStrength: "0.6",
      positivePrompt: "a portrait",
      negativePrompt: "blurry",
      width: 832,
      height: 1216,
      seed: "7",
    });

    expect(filled["1"].inputs.ckpt_name).toBe("juggernaut.safetensors");
    expect(filled["2"].inputs).toMatchObject({ lora_name: "aria.safetensors", strength_model: 0.6 });
    expect(filled["3"].inputs.text).toBe("a portrait");
    expect(filled["4"].inputs.text).toBe("blurry");
    expect(filled["5"].inputs).toMatchObject({ width: 832, height: 1216 });
    expect(filled["6"].inputs.seed).toBe(7);
  });

  it("leaves the template itself unchanged", () => {
    const before = JSON.stringify(withLora);
    fillWorkflow(withLora, mappings, { positivePrompt: "changed", lora: "" });
    expect(JSON.stringify(withLora)).toBe(before);
  });

  it("removes an unused LoRA loader and rewires its readers to its inputs", () => {
    const filled = fillWorkflow(withLora, mappings, { lora: "  " });

    expect(filled["2"]).toBeUndefined();
    expect(filled["3"].inputs.clip).toEqual(["1", 1]);
    expect(filled["6"].inputs.model).toEqual(["1", 0]);
  });

  it("removes a model-only LoRA loader too", () => {
    const flux = BUILT_IN_TEMPLATES.find((t) => t.id === "flux-kontext-gguf")!;
    const filled = fillWorkflow(flux.workflow, flux.mappings, {});
    expect(filled["2"]).toBeUndefined();
    expect(filled["13"].inputs.model).toEqual(["1", 0]);
  });

  it("fills the FaceID strengths as numbers, keeping the LoRA bypass intact", () => {
    const faceId = BUILT_IN_TEMPLATES.find((t) => t.id === "sdxl-faceid")!;
    const filled = fillWorkflow(faceId.workflow, faceId.mappings, { faceIdWeight: "0.6", faceIdLoraStrength: 0.5 });
    expect(filled["11"].inputs.weight).toBe(0.6);
    expect(filled["10"].inputs).toMatchObject({ lora_strength: 0.5, model: ["1", 0] });
    // Without values the template's own strengths stay.
    expect(fillWorkflow(faceId.workflow, faceId.mappings, {})["11"].inputs.weight).toBe(0.85);
  });

  it("keeps a values-free input at the workflow's own value", () => {
    const filled = fillWorkflow(withLora, mappings, { lora: "x.safetensors" });
    expect(filled["1"].inputs.ckpt_name).toBe("base.safetensors");
  });

  it("explains a mapping to a node the workflow doesn't have", () => {
    expect(() =>
      fillWorkflow(withLora, [{ placeholder: "seed", nodeId: "99", input: "seed" }], { seed: 1, lora: "x" })
    ).toThrow(/no node 99 for "Seed"/);
  });
});

describe("sizeForAspectRatio", () => {
  it.each([
    [undefined, 1024, 1024, 1024],
    ["1:1", 1024, 1024, 1024],
    ["3:4", 1024, 896, 1152],
    ["16:9", 1024, 1344, 768],
    ["9:16", 1024, 768, 1344],
    ["2:3", 512, 448, 640],
    ["nonsense", 768, 768, 768],
  ])("%s at base %d is %dx%d", (ratio, base, width, height) => {
    expect(sizeForAspectRatio(ratio as string | undefined, base)).toEqual({ width, height });
  });
});

describe("parseApiWorkflow", () => {
  it("accepts an API-format workflow", () => {
    expect(parseApiWorkflow(JSON.stringify(withLora))["6"].class_type).toBe("KSampler");
  });

  it("rejects the UI format with a pointer to Export (API)", () => {
    expect(() => parseApiWorkflow(JSON.stringify({ nodes: [], links: [], version: 0.4 }))).toThrow(/Export \(API\)/);
  });

  it("rejects bad JSON and nodes without a class", () => {
    expect(() => parseApiWorkflow("{")).toThrow(/valid JSON/);
    expect(() => parseApiWorkflow(JSON.stringify({ "1": { inputs: {} } }))).toThrow(/Node "1"/);
  });
});

describe("suggestMappings", () => {
  it("finds the usual placeholders in a plain SDXL workflow", () => {
    const found = suggestMappings(withLora);
    const key = (m: PlaceholderMapping) => `${m.placeholder}@${m.nodeId}.${m.input}`;
    expect(found.map(key).sort()).toEqual(
      [...mappings.map(key), "loraStrength@2.strength_clip"].sort()
    );
  });

  it("follows Kontext's conditioning chain back to the prompt and maps the reference image", () => {
    const flux = BUILT_IN_TEMPLATES.find((t) => t.id === "flux-kontext-gguf")!;
    const found = suggestMappings(flux.workflow);
    expect(found).toEqual(expect.arrayContaining(flux.mappings));
    // The zeroed-out negative isn't a prompt anyone should write into.
    expect(found.some((m) => m.placeholder === "negativePrompt")).toBe(false);
  });
});

describe("suggestMappings on a custom-sampler graph (FLUX.2 Klein, Z-Image)", () => {
  // The scheduler before the latent, as an exported file may list them.
  const klein: ComfyWorkflow = {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "flux-2-klein-4b-fp8.safetensors", weight_dtype: "default" } },
    "2": { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "", strength_model: 1, model: ["1", 0] } },
    "3": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b.safetensors", type: "flux2" } },
    "5": { class_type: "LoadImage", inputs: { image: "" } },
    "8": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["3", 0] } },
    "9": { class_type: "ReferenceLatent", inputs: { conditioning: ["8", 0], latent: ["7", 0] } },
    "10": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["8", 0] } },
    "11": { class_type: "CFGGuider", inputs: { cfg: 1, model: ["2", 0], positive: ["9", 0], negative: ["10", 0] } },
    "12a": { class_type: "Flux2Scheduler", inputs: { steps: 4, width: 1024, height: 1024 } },
    "13": { class_type: "EmptyFlux2LatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
    "15": { class_type: "RandomNoise", inputs: { noise_seed: 0 } },
    "16": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["15", 0], guider: ["11", 0], sigmas: ["12a", 0], latent_image: ["13", 0] } },
  };

  it("finds the seed on RandomNoise, the prompt through the guider and the size on both the latent and the scheduler", () => {
    const found = suggestMappings(klein);
    expect(found).toEqual(
      expect.arrayContaining([
        { placeholder: "seed", nodeId: "15", input: "noise_seed" },
        { placeholder: "positivePrompt", nodeId: "8", input: "text" },
        { placeholder: "width", nodeId: "13", input: "width" },
        { placeholder: "height", nodeId: "13", input: "height" },
        { placeholder: "width", nodeId: "12a", input: "width" },
        { placeholder: "height", nodeId: "12a", input: "height" },
        { placeholder: "checkpoint", nodeId: "1", input: "unet_name" },
        { placeholder: "lora", nodeId: "2", input: "lora_name" },
        { placeholder: "referenceImage", nodeId: "5", input: "image" },
      ])
    );
    // The zeroed-out negative isn't a prompt.
    expect(found.some((m) => m.placeholder === "negativePrompt")).toBe(false);
  });

  it("fills one size into the latent and the scheduler", () => {
    const filled = fillWorkflow(klein, suggestMappings(klein), { width: 896, height: 1152 });
    expect(filled["13"].inputs).toMatchObject({ width: 896, height: 1152 });
    expect(filled["12a"].inputs).toMatchObject({ width: 896, height: 1152 });
  });

  it("finds a CFGGuider's real negative prompt", () => {
    const withNegative: ComfyWorkflow = {
      ...klein,
      "10": { class_type: "CLIPTextEncode", inputs: { text: "blurry", clip: ["3", 0] } },
    };
    expect(suggestMappings(withNegative)).toEqual(expect.arrayContaining([{ placeholder: "negativePrompt", nodeId: "10", input: "text" }]));
  });
});

describe("listLiteralInputs", () => {
  it("lists only literal inputs, never links", () => {
    const inputs = listLiteralInputs(withLora);
    expect(inputs.every((i) => !isLink(i.value))).toBe(true);
    expect(inputs).toContainEqual(expect.objectContaining({ nodeId: "6", input: "seed", classType: "KSampler" }));
  });
});
