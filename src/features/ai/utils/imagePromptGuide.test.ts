import { buildImagePromptRequest, dialectForCheckpoint, parseImagePromptReply, resolveImagePromptTarget } from "./imagePromptGuide";
import { LS_COMFYUI_SETTINGS } from "../comfyui/settings";

afterEach(() => localStorage.clear());

describe("dialectForCheckpoint", () => {
  it("reads the model family from the file name", () => {
    expect(dialectForCheckpoint("ponyDiffusionV6XL.safetensors")).toBe("pony");
    expect(dialectForCheckpoint("waiNSFWIllustrious_v140.safetensors")).toBe("illustrious");
    expect(dialectForCheckpoint("juggernautXL_v9.safetensors")).toBe("sdxl");
    expect(dialectForCheckpoint("flux1-dev-Q4_K_S.gguf")).toBe("flux");
    expect(dialectForCheckpoint("v1-5-pruned-emaonly.safetensors")).toBe("sd15");
    expect(dialectForCheckpoint("")).toBe("sd15");
    expect(dialectForCheckpoint("mystery.safetensors", "sdxl")).toBe("sdxl");
  });
});

describe("resolveImagePromptTarget", () => {
  it("writes prose for hosted models and tags for the SD WebUI", () => {
    expect(resolveImagePromptTarget({ providerId: "openai", imageModel: "gpt-image-1" })).toMatchObject({ dialect: "prose", tags: false, wantsParams: false });
    expect(resolveImagePromptTarget({ providerId: "fal", imageModel: "fal-ai/flux-pro/kontext" }).dialect).toBe("flux");
    expect(resolveImagePromptTarget({ providerId: "sdwebui", sdWebuiModel: "ponyDiffusionV6XL" })).toMatchObject({ dialect: "pony", tags: true, wantsParams: true });
    expect(resolveImagePromptTarget({ providerId: "openai", isVideo: true }).guide).toContain("how the camera moves");
  });

  it("follows the ComfyUI workflow that will run", () => {
    // Bundled defaults: SDXL text to image without a reference photo.
    expect(resolveImagePromptTarget({ providerId: "comfyui" })).toMatchObject({ dialect: "sdxl", tags: true });
    // The FLUX Kontext template, picked by the character's img2img reference mode.
    expect(resolveImagePromptTarget({ providerId: "comfyui", hasReference: true, referenceMode: "img2img" }).dialect).toBe("flux");
    localStorage.setItem(LS_COMFYUI_SETTINGS, JSON.stringify({ textTemplateId: "sdxl-txt2img", templateOptions: { "sdxl-txt2img": { checkpoint: "ponyDiffusionV6XL.safetensors" } } }));
    const pony = resolveImagePromptTarget({ providerId: "comfyui" });
    expect(pony.dialect).toBe("pony");
    expect(pony.engine).toContain("ponyDiffusionV6XL.safetensors");
  });
});

describe("the prompt-writing call", () => {
  it("gives the scene, the style and the model's own rules", () => {
    const t = resolveImagePromptTarget({ providerId: "comfyui" });
    const request = buildImagePromptRequest({ target: t, scene: "Aria waves from a rainy bus stop.", baseStyle: "Cinematic.", artStyleClause: "anime style" });
    expect(request).toContain('You write prompts for an image generator: ComfyUI running the "SDXL text to image" workflow');
    expect(request).toContain('"""\nAria waves from a rainy bus stop.\n"""');
    expect(request).toContain("Always follow this style rule: Cinematic.\nArt style: anime style.");
    expect(request).toContain("short comma-separated phrases");
    expect(request).toContain("Reply with only the prompt");
  });

  it("reads the prompt and params back", () => {
    expect(parseImagePromptReply('PROMPT:\n"1girl, rain, bus stop"', false).prompt).toBe("1girl, rain, bus stop");
    expect(parseImagePromptReply("1girl, rain\nPARAMS:\n```json\n{\"steps\": 28}\n```", true)).toEqual({ prompt: "1girl, rain", params: { steps: 28 } });
    expect(parseImagePromptReply("PROMPT: a cat\nPARAMS: not json", true)).toEqual({ prompt: "a cat", params: {} });
    expect(parseImagePromptReply("PROMPT:\na cat on a sofa\n\nSUMMARY:\nHere you go!", false).prompt).toBe("a cat on a sofa");
  });
});
