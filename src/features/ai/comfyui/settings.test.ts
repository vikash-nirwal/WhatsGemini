import {
  chooseTemplate,
  CustomWorkflow,
  customToTemplate,
  DEFAULT_COMFYUI_SETTINGS,
  loadComfySettings,
  loadCustomWorkflows,
  parseSeed,
  saveComfySettings,
  saveCustomWorkflows,
  templateOptionsFor,
} from "./settings";

const textOnlyCustom: CustomWorkflow = {
  id: "custom:plain",
  name: "My plain workflow",
  workflow: {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "mine.safetensors" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["1", 1] } },
  },
  mappings: [
    { placeholder: "checkpoint", nodeId: "1", input: "ckpt_name" },
    { placeholder: "positivePrompt", nodeId: "2", input: "text" },
  ],
};

const referenceCustom: CustomWorkflow = {
  ...textOnlyCustom,
  id: "custom:ref",
  name: "My Qwen edit",
  workflow: { ...textOnlyCustom.workflow, "3": { class_type: "LoadImage", inputs: { image: "" } } },
  mappings: [...textOnlyCustom.mappings, { placeholder: "referenceImage", nodeId: "3", input: "image" }],
};

beforeEach(() => localStorage.clear());

describe("chooseTemplate", () => {
  const settings = DEFAULT_COMFYUI_SETTINGS;

  it("uses the reference template when there's a reference photo, the text one otherwise", () => {
    expect(chooseTemplate(settings, true, []).id).toBe("sdxl-faceid");
    expect(chooseTemplate(settings, false, []).id).toBe("sdxl-txt2img");
  });

  it("follows the user's picks, including imported workflows", () => {
    const picked = { ...settings, referenceTemplateId: "custom:ref", textTemplateId: "custom:plain" };
    expect(chooseTemplate(picked, true, [textOnlyCustom, referenceCustom]).id).toBe("custom:ref");
    expect(chooseTemplate(picked, false, [textOnlyCustom, referenceCustom]).id).toBe("custom:plain");
  });

  it("never runs a reference template without a reference", () => {
    const picked = { ...settings, textTemplateId: "flux-kontext-gguf" };
    expect(chooseTemplate(picked, false, []).id).toBe("sdxl-txt2img");
    expect(chooseTemplate({ ...settings, textTemplateId: "custom:ref" }, false, [referenceCustom]).id).toBe("sdxl-txt2img");
  });

  it("falls back to the defaults when a picked workflow was deleted", () => {
    const picked = { ...settings, referenceTemplateId: "custom:gone", textTemplateId: "custom:gone" };
    expect(chooseTemplate(picked, true, []).id).toBe("sdxl-faceid");
    expect(chooseTemplate(picked, false, []).id).toBe("sdxl-txt2img");
  });

  it("lets a text-only template ignore references on purpose", () => {
    expect(chooseTemplate({ ...settings, referenceTemplateId: "sdxl-txt2img" }, true, []).id).toBe("sdxl-txt2img");
  });
});

describe("templateOptionsFor", () => {
  it("uses the template's defaults until the user sets their own", () => {
    const template = chooseTemplate(DEFAULT_COMFYUI_SETTINGS, true, []);
    expect(templateOptionsFor(DEFAULT_COMFYUI_SETTINGS, template)).toEqual({
      checkpoint: "sd_xl_base_1.0.safetensors",
      lora: "",
      loraStrength: 0.8,
    });
    const custom = { ...DEFAULT_COMFYUI_SETTINGS, templateOptions: { "sdxl-faceid": { checkpoint: "juggernaut.safetensors", loraStrength: 0.5 } } };
    expect(templateOptionsFor(custom, template)).toMatchObject({ checkpoint: "juggernaut.safetensors", loraStrength: 0.5 });
  });

  it("takes an imported workflow's saved checkpoint as its default", () => {
    expect(customToTemplate(textOnlyCustom).defaultCheckpoint).toBe("mine.safetensors");
    expect(customToTemplate(textOnlyCustom).checkpointSource).toEqual({ classType: "CheckpointLoaderSimple", input: "ckpt_name" });
  });
});

describe("storage", () => {
  it("round-trips settings and imported workflows under their own keys", () => {
    saveComfySettings({ ...DEFAULT_COMFYUI_SETTINGS, serverUrl: "http://192.168.1.5:8188" });
    saveCustomWorkflows([textOnlyCustom]);
    expect(localStorage.getItem("comfyui_settings")).toContain("192.168.1.5");
    expect(loadComfySettings().serverUrl).toBe("http://192.168.1.5:8188");
    expect(loadComfySettings().textTemplateId).toBe("sdxl-txt2img");
    expect(loadCustomWorkflows()).toEqual([textOnlyCustom]);
  });

  it("reads defaults when nothing is stored", () => {
    expect(loadComfySettings()).toEqual(DEFAULT_COMFYUI_SETTINGS);
    expect(loadCustomWorkflows()).toEqual([]);
  });
});

it("parseSeed accepts whole numbers only", () => {
  expect(parseSeed("123")).toBe(123);
  expect(parseSeed(" 9 ")).toBe(9);
  expect(parseSeed("")).toBeUndefined();
  expect(parseSeed("-1")).toBeUndefined();
  expect(parseSeed("1.5")).toBeUndefined();
});
