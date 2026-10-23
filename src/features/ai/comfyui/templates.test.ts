import { BUILT_IN_TEMPLATES, DEFAULT_REFERENCE_TEMPLATE_ID, DEFAULT_TEXT_TEMPLATE_ID } from "./templates";
import { fillWorkflow, isLink, suggestMappings, usesReference } from "./workflow";

// The bundled workflows can't be run here without a real ComfyUI, so these
// check what can go wrong in the JSON itself: links to missing nodes,
// mappings to missing inputs, and a broken graph once the LoRA is removed.
describe.each(BUILT_IN_TEMPLATES.map((t) => [t.id, t] as const))("template %s", (_id, template) => {
  const danglingLinks = (workflow: typeof template.workflow) =>
    Object.entries(workflow).flatMap(([id, node]) =>
      Object.entries(node.inputs)
        .filter(([, v]) => isLink(v) && !workflow[(v as [string, number])[0]])
        .map(([input]) => `${id}.${input}`)
    );

  it("links only to nodes it has", () => {
    expect(danglingLinks(template.workflow)).toEqual([]);
  });

  it("maps every placeholder to an existing literal input", () => {
    for (const m of template.mappings) {
      const node = template.workflow[m.nodeId];
      expect(node).toBeDefined();
      expect(node.inputs).toHaveProperty(m.input);
      expect(isLink(node.inputs[m.input])).toBe(false);
    }
  });

  it("maps the prompt, seed and size", () => {
    const placeholders = template.mappings.map((m) => m.placeholder);
    expect(placeholders).toEqual(expect.arrayContaining(["positivePrompt", "seed", "width", "height", "checkpoint", "lora"]));
  });

  it("stays connected with and without a LoRA", () => {
    expect(danglingLinks(fillWorkflow(template.workflow, template.mappings, { lora: "" }))).toEqual([]);
    expect(danglingLinks(fillWorkflow(template.workflow, template.mappings, { lora: "x.safetensors" }))).toEqual([]);
  });

  it("ends in exactly one SaveImage", () => {
    expect(Object.values(template.workflow).filter((n) => n.class_type === "SaveImage")).toHaveLength(1);
  });

  it("lists the custom node classes it actually uses", () => {
    const classes = new Set(Object.values(template.workflow).map((n) => n.class_type));
    for (const pack of template.requirements.customNodes) {
      for (const c of pack.classTypes) expect(classes.has(c)).toBe(true);
    }
  });
});

it("ships two text-only templates and four that use the reference photo", () => {
  expect(BUILT_IN_TEMPLATES.filter((t) => !usesReference(t.mappings)).map((t) => t.id)).toEqual(["z-image-turbo-txt2img", "sdxl-txt2img"]);
  expect(BUILT_IN_TEMPLATES.filter((t) => usesReference(t.mappings))).toHaveLength(4);
});

it("makes Klein and Z-Image the defaults", () => {
  expect(DEFAULT_REFERENCE_TEMPLATE_ID).toBe("flux2-klein-4b-reference");
  expect(DEFAULT_TEXT_TEMPLATE_ID).toBe("z-image-turbo-txt2img");
});

// Both run at cfg 1 from a UNETLoader, so: no negative prompt, the UNET and
// model-only LoRA lists, and the model wired straight to its reader when no
// LoRA is set.
describe.each([
  ["flux2-klein-4b-reference", "16", "flux-2-klein-4b-fp8.safetensors"],
  ["z-image-turbo-txt2img", "3", "z_image_turbo_bf16.safetensors"],
] as const)("%s", (id, modelReader, checkpoint) => {
  const template = BUILT_IN_TEMPLATES.find((t) => t.id === id)!;

  it("loads its model and LoRA from the UNET loaders, with no negative prompt", () => {
    expect(template).toMatchObject({
      defaultCheckpoint: checkpoint,
      defaultLoraStrength: 1,
      checkpointSource: { classType: "UNETLoader", input: "unet_name" },
      loraSource: { classType: "LoraLoaderModelOnly", input: "lora_name" },
    });
    expect(template.workflow["1"].inputs.unet_name).toBe(checkpoint);
    expect(template.mappings.some((m) => m.placeholder === "negativePrompt")).toBe(false);
    expect(template.requirements.customNodes).toEqual([]);
  });

  it("bypasses node 2 without a LoRA and keeps it with one", () => {
    const bare = fillWorkflow(template.workflow, template.mappings, { lora: "" });
    expect(bare["2"]).toBeUndefined();
    expect(bare[modelReader].inputs.model).toEqual(["1", 0]);
    const withLora = fillWorkflow(template.workflow, template.mappings, { lora: "style.safetensors", loraStrength: 0.7 });
    expect(withLora["2"].inputs).toMatchObject({ lora_name: "style.safetensors", strength_model: 0.7 });
    expect(withLora[modelReader].inputs.model).toEqual(["2", 0]);
  });
});

it("gives Klein's latent and scheduler the same size, and its seed to RandomNoise", () => {
  const klein = BUILT_IN_TEMPLATES.find((t) => t.id === "flux2-klein-4b-reference")!;
  const filled = fillWorkflow(klein.workflow, klein.mappings, { width: 896, height: 1152, seed: 7, positivePrompt: "p", referenceImage: "ref.png" });
  expect(filled["12"].inputs).toMatchObject({ width: 896, height: 1152 });
  expect(filled["13"].inputs).toMatchObject({ width: 896, height: 1152 });
  expect(filled["15"].inputs.noise_seed).toBe(7);
  expect(filled["8"].inputs.text).toBe("p");
  expect(filled["5"].inputs.image).toBe("ref.png");
  expect(klein.promptFormat).toMatch(/^Keep the person from image 1 the same.*\{prompt\}$/);
});

it("finds the same mappings in an imported copy of Klein or Z-Image", () => {
  for (const id of ["flux2-klein-4b-reference", "z-image-turbo-txt2img"]) {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === id)!;
    expect(suggestMappings(template.workflow)).toEqual(expect.arrayContaining(template.mappings));
  }
});

it("maps the FaceID strengths, so they can follow the art style", () => {
  const faceId = BUILT_IN_TEMPLATES.find((t) => t.id === "sdxl-faceid")!;
  expect(faceId.mappings).toEqual(
    expect.arrayContaining([
      { placeholder: "faceIdWeight", nodeId: "11", input: "weight" },
      { placeholder: "faceIdLoraStrength", nodeId: "10", input: "lora_strength" },
    ])
  );
  expect(faceId.workflow["11"].class_type).toBe("IPAdapterFaceID");
  expect(faceId.workflow["10"].class_type).toBe("IPAdapterUnifiedLoaderFaceID");
});
