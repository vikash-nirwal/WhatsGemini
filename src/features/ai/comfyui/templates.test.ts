import { BUILT_IN_TEMPLATES } from "./templates";
import { fillWorkflow, isLink, usesReference } from "./workflow";

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

it("ships one text-only template and three that use the reference photo", () => {
  expect(BUILT_IN_TEMPLATES.filter((t) => !usesReference(t.mappings)).map((t) => t.id)).toEqual(["sdxl-txt2img"]);
  expect(BUILT_IN_TEMPLATES.filter((t) => usesReference(t.mappings))).toHaveLength(3);
});
