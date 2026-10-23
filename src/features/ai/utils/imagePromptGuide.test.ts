import { buildImagePromptRequest, dialectForCheckpoint, guessStyleCheckpoint, parseImagePromptReply, resolveImagePromptTarget } from "./imagePromptGuide";
import { LS_COMFYUI_SETTINGS } from "../comfyui/settings";

afterEach(() => localStorage.clear());

describe("dialectForCheckpoint", () => {
  it("reads the model family from the file name", () => {
    expect(dialectForCheckpoint("ponyDiffusionV6XL.safetensors")).toBe("pony");
    expect(dialectForCheckpoint("waiNSFWIllustrious_v140.safetensors")).toBe("illustrious");
    expect(dialectForCheckpoint("juggernautXL_v9.safetensors")).toBe("sdxl");
    expect(dialectForCheckpoint("flux1-dev-Q4_K_S.gguf")).toBe("flux");
    expect(dialectForCheckpoint("flux-2-klein-4b-fp8.safetensors")).toBe("flux");
    expect(dialectForCheckpoint("z_image_turbo_bf16.safetensors")).toBe("flux");
    expect(dialectForCheckpoint("Z-Image-Turbo.safetensors")).toBe("flux");
    expect(dialectForCheckpoint("zimage_turbo.safetensors")).toBe("flux");
    expect(dialectForCheckpoint("v1-5-pruned-emaonly.safetensors")).toBe("sd15");
    expect(dialectForCheckpoint("")).toBe("sd15");
    expect(dialectForCheckpoint("mystery.safetensors", "sdxl")).toBe("sdxl");
  });
});

describe("guessStyleCheckpoint", () => {
  const installed = [
    "flux1-dev-anime.safetensors",
    "juggernautXL_v9.safetensors",
    "ponyRealism_v22.safetensors",
    "RealVisXL_V5.0.safetensors",
    "sd_xl_base_1.0.safetensors",
    "waiNSFWIllustrious_v140.safetensors",
  ];

  it("finds an anime and a realistic checkpoint by name", () => {
    expect(guessStyleCheckpoint("anime", installed)).toBe("waiNSFWIllustrious_v140.safetensors");
    expect(guessStyleCheckpoint("realistic", installed)).toBe("juggernautXL_v9.safetensors");
    expect(guessStyleCheckpoint("anime", ["animagineXLV31.safetensors"])).toBe("animagineXLV31.safetensors");
  });

  it("guesses nothing when no name fits", () => {
    expect(guessStyleCheckpoint("3d", installed)).toBeUndefined();
    expect(guessStyleCheckpoint("anime", ["sd_xl_base_1.0.safetensors"])).toBeUndefined();
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
    // Bundled defaults: Z-Image without a reference photo, Klein with one,
    // both written as prose.
    const zImage = resolveImagePromptTarget({ providerId: "comfyui" });
    expect(zImage).toMatchObject({ dialect: "flux", tags: false });
    expect(zImage.engine).toContain('"Z-Image Turbo text to image"');
    expect(resolveImagePromptTarget({ providerId: "comfyui", hasReference: true }).engine).toContain("FLUX.2 Klein 4B");
    // The SDXL FaceID template, picked by the character's controlnet reference mode.
    expect(resolveImagePromptTarget({ providerId: "comfyui", hasReference: true, referenceMode: "controlnet" }).dialect).toBe("sdxl");
    // Z-Image stays prose even with its file renamed.
    localStorage.setItem(LS_COMFYUI_SETTINGS, JSON.stringify({ templateOptions: { "z-image-turbo-txt2img": { checkpoint: "my-turbo.safetensors" } } }));
    expect(resolveImagePromptTarget({ providerId: "comfyui" }).dialect).toBe("flux");
    localStorage.setItem(LS_COMFYUI_SETTINGS, JSON.stringify({ textTemplateId: "sdxl-txt2img", templateOptions: { "sdxl-txt2img": { checkpoint: "ponyDiffusionV6XL.safetensors" } } }));
    const pony = resolveImagePromptTarget({ providerId: "comfyui" });
    expect(pony.dialect).toBe("pony");
    expect(pony.engine).toContain("ponyDiffusionV6XL.safetensors");
  });

  it("writes for the checkpoint the character's art style runs on", () => {
    localStorage.setItem(LS_COMFYUI_SETTINGS, JSON.stringify({ referenceTemplateId: "sdxl-faceid", styleOptions: { anime: { checkpoint: "waiNSFWIllustrious_v140.safetensors" } } }));
    expect(resolveImagePromptTarget({ providerId: "comfyui", hasReference: true, artStyle: "anime" }).dialect).toBe("illustrious");
    expect(resolveImagePromptTarget({ providerId: "comfyui", hasReference: true, artStyle: "realistic" }).dialect).toBe("sdxl");
  });

  it("matches the adapter when the reference mode leaves the photo out", () => {
    localStorage.setItem(LS_COMFYUI_SETTINGS, JSON.stringify({ referenceTemplateId: "flux-kontext-gguf", textTemplateId: "sdxl-txt2img" }));
    expect(resolveImagePromptTarget({ providerId: "comfyui", hasReference: true }).dialect).toBe("flux");
    expect(resolveImagePromptTarget({ providerId: "comfyui", hasReference: true, referenceMode: "none" }).dialect).toBe("sdxl");
  });
});

describe("the prompt-writing call", () => {
  it("gives the scene, the style and the model's own rules", () => {
    localStorage.setItem(LS_COMFYUI_SETTINGS, JSON.stringify({ textTemplateId: "sdxl-txt2img" }));
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
