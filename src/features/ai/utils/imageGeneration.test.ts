import { composeImagePrompt, deriveImagePrompt, generateImage, ImagePromptRefusedError, parseSceneReply } from "./imageGeneration";
import { resolveImagePromptTarget } from "./imagePromptGuide";
import { LS_COMFYUI_SETTINGS } from "../comfyui/settings";
import { ChatProviderAdapter, ContentBlockedError } from "../providers/types";

// The real registry pulls in provider SDKs that Jest can't load (ESM-only);
// deriveImagePrompt doesn't use it, and generateImage gets a ComfyUI stand-in
// that records what it was asked for.
const mockComfyCalls: any[] = [];
jest.mock("../providers/registry", () => ({
  IMAGE_PROVIDERS: {
    comfyui: {
      id: "comfyui",
      generateImage: async (opts: any) => {
        mockComfyCalls.push(opts);
        return { images: ["data:image/png;base64,AA=="] };
      },
    },
  },
}));

// #34: the image prompt writer is told the locked look, and the final prompt
// carries it word for word even when the model paraphrases it away.

const MIRA = { name: "Mira", visualTags: "early 20s, pale skin, long silver hair, violet eyes, scar over left eyebrow" };

// Replies in order, one per call; a reply that's an Error makes that call fail.
const fakeAdapter = (replies: (string | Error)[], seen: string[]): ChatProviderAdapter => ({
  id: "fake",
  capabilities: { requiresApiKey: false, requiresBaseUrl: false } as any,
  generateChat: async (opts: any) => {
    seen.push(opts.prompt);
    const reply = replies[Math.min(seen.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return { text: reply, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
  },
  generateOnce: async () => ({ text: "" }),
} as any);

// The SDXL text-to-image template, picked by hand: Klein and Z-Image are the defaults.
localStorage.setItem(LS_COMFYUI_SETTINGS, JSON.stringify({ textTemplateId: "sdxl-txt2img" }));
const SDXL_COMFY = resolveImagePromptTarget({ providerId: "comfyui" });
localStorage.clear();
const SD_WEBUI = resolveImagePromptTarget({ providerId: "sdwebui" });
const OPENAI = resolveImagePromptTarget({ providerId: "openai" });

const derive = (adapter: ChatProviderAdapter, target = OPENAI, existingImagePrompt?: string, locks = [MIRA]) =>
  deriveImagePrompt(adapter, {} as any, "m", {}, [], "Send me a selfie", "anime style", target, existingImagePrompt, undefined, undefined, false, false, undefined, locks);

const SCENE_REPLY = "SCENE:\nMira takes a selfie at a rainy cafe window, smiling, upper body.\n\nREPLY:\nHere you go! [Image Context: selfie at the cafe]";

describe("deriveImagePrompt writes the prompt for the image model in use", () => {
  it("describes the moment in character, then writes the prompt for that model", async () => {
    const seen: string[] = [];
    const result = await derive(fakeAdapter([SCENE_REPLY, "1girl, solo, rainy cafe window, smiling, selfie, upper body"], seen), SDXL_COMFY, undefined, []);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('The user\'s message: "Send me a selfie"');
    expect(seen[0]).toContain("SCENE:");
    expect(seen[1]).toContain('You write prompts for an image generator: ComfyUI running the "SDXL text to image" workflow');
    expect(seen[1]).toContain("Mira takes a selfie at a rainy cafe window");
    expect(seen[1]).toContain("short comma-separated phrases");
    expect(seen[1]).toContain("Always follow this style rule: anime style");
    expect(result.derivedImagePrompt).toBe("1girl, solo, rainy cafe window, smiling, selfie, upper body");
    expect(result.derivedSummary).toBe("Here you go! [Image Context: selfie at the cafe]");
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10, totalTokens: 30 });
  });

  it("never sends the user's message as the prompt when the first call breaks the format", async () => {
    const seen: string[] = [];
    const result = await derive(fakeAdapter(["Here's me at the cafe! [Image Context: selfie by a rainy window]", "a woman taking a selfie by a rainy cafe window"], seen), OPENAI, undefined, []);
    expect(seen[1]).toContain('The user said: "Send me a selfie"');
    expect(seen[1]).toContain("It shows: selfie by a rainy window");
    expect(result.derivedImagePrompt).toBe("a woman taking a selfie by a rainy cafe window");
    expect(result.derivedSummary).toBe("Here's me at the cafe! [Image Context: selfie by a rainy window]");
  });

  it("uses the description itself if writing the prompt fails", async () => {
    const result = await derive(fakeAdapter([SCENE_REPLY, new Error("rate limited")], []), OPENAI, undefined, []);
    expect(result.derivedImagePrompt).toBe("Mira takes a selfie at a rainy cafe window, smiling, upper body.");
  });

  it("reads Stable Diffusion WebUI params from the prompt reply", async () => {
    const result = await derive(fakeAdapter([SCENE_REPLY, 'PROMPT:\nmasterpiece, 1girl, cafe\nPARAMS:\n{"steps": 28, "width": 512, "height": 768}'], []), SD_WEBUI, undefined, []);
    expect(result.derivedImagePrompt).toBe("masterpiece, 1girl, cafe");
    expect(result.derivedParams).toEqual({ steps: 28, width: 512, height: 768 });
  });

  it("asks ComfyUI's prompt writer for the framing only, and reads it back", async () => {
    const seen: string[] = [];
    const result = await derive(fakeAdapter([SCENE_REPLY, 'PROMPT:\n1girl, selfie, rainy cafe window\nPARAMS:\n{"width": 832, "height": 1216}'], seen), SDXL_COMFY, undefined, []);
    expect(seen[1]).toContain('"width" and "height" that frame this picture best');
    expect(seen[1]).not.toContain('"steps"');
    expect(result.derivedImagePrompt).toBe("1girl, selfie, rainy cafe window");
    expect(result.derivedParams).toEqual({ width: 832, height: 1216 });
  });
});

describe("generateImage passes the prompt writer's framing on", () => {
  const draw = (params: Record<string, number>, aspectRatio?: string) =>
    generateImage("comfyui", {} as any, false, "", "a woman at a cafe window", params, undefined, undefined, {} as any, undefined, undefined, aspectRatio);

  it("uses the PARAMS size as the aspect ratio unless the caller fixed one", async () => {
    await draw({ width: 832, height: 1216 });
    expect(mockComfyCalls[mockComfyCalls.length - 1].aspectRatio).toBe("832:1216");
    await draw({ width: 832, height: 1216 }, "1:1");
    expect(mockComfyCalls[mockComfyCalls.length - 1].aspectRatio).toBe("1:1");
    await draw({});
    expect(mockComfyCalls[mockComfyCalls.length - 1].aspectRatio).toBeUndefined();
  });
});

describe("a refused prompt", () => {
  const REFUSAL = "I can't create a sexually explicit image prompt. I can help with something else.";

  it("is never sent as the prompt", async () => {
    const result = await derive(fakeAdapter([SCENE_REPLY, REFUSAL], []), SDXL_COMFY);
    expect(result).toMatchObject({ refused: true, derivedImagePrompt: "", derivedSummary: "Here you go! [Image Context: selfie at the cafe]" });
  });

  it("stops the picture when the provider blocks the prompt call, instead of sending the plain description", async () => {
    const result = await derive(fakeAdapter([SCENE_REPLY, new ContentBlockedError("Gemini", "PROHIBITED_CONTENT")], []), SDXL_COMFY);
    expect(result.refused).toBe(true);
    expect(result.derivedImagePrompt).toBe("");
  });

  it("stops the picture when the in-character call already refused", async () => {
    const seen: string[] = [];
    const result = await derive(fakeAdapter(["I'm sorry, but I can't continue with this roleplay.", "1girl"], seen), SDXL_COMFY);
    expect(seen).toHaveLength(1);
    expect(result.refused).toBe(true);
  });

  it("isn't redrawn from an earlier picture's saved prompt", async () => {
    const seen: string[] = [];
    const result = await derive(fakeAdapter([""], seen), SDXL_COMFY, REFUSAL);
    expect(seen).toHaveLength(0);
    expect(result.refused).toBe(true);
  });

  it("throws from composeImagePrompt so portraits and backdrops can fall back", async () => {
    await expect(composeImagePrompt(fakeAdapter([REFUSAL], []), {} as any, "m", { target: SDXL_COMFY, scene: "a cafe" })).rejects.toBeInstanceOf(ImagePromptRefusedError);
  });

  it("goes out with the chat's safety settings", async () => {
    const safety: any[] = [];
    const adapter = { ...fakeAdapter(["1girl, cafe"], []), generateChat: async (opts: any) => (safety.push(opts.safetySettings), { text: "1girl, cafe" }) } as any;
    await composeImagePrompt(adapter, {} as any, "m", { target: SDXL_COMFY, scene: "a cafe", safetySettings: { harassment: "BLOCK_NONE" } as any });
    expect(safety).toEqual([{ harassment: "BLOCK_NONE" }]);
  });
});

describe("deriveImagePrompt with a locked look", () => {
  it("tells the prompt writer the locked look and keeps its wording when it complied", async () => {
    const seen: string[] = [];
    const result = await derive(fakeAdapter([SCENE_REPLY, `Mira: ${MIRA.visualTags}, smiling at a cafe window`], seen));
    expect(seen[1]).toContain("word for word");
    expect(seen[1]).toContain(`- Mira: ${MIRA.visualTags}`);
    expect(result.derivedImagePrompt).toBe(`Mira: ${MIRA.visualTags}, smiling at a cafe window`);
  });

  it("puts the look back when the prompt paraphrased it", async () => {
    const result = await derive(fakeAdapter([SCENE_REPLY, "a silver-haired girl smiling at a cafe window"], []));
    expect(result.derivedImagePrompt).toBe(`Mira: ${MIRA.visualTags}. a silver-haired girl smiling at a cafe window`);
  });

  it("uses tag style for tag models", async () => {
    const result = await derive(fakeAdapter([SCENE_REPLY, "1girl, cafe, smiling"], []), SDXL_COMFY);
    expect(result.derivedImagePrompt).toBe(`${MIRA.visualTags}, 1girl, cafe, smiling`);
  });

  it("adds the look to a redraw of an older prompt", async () => {
    const seen: string[] = [];
    const result = await derive(fakeAdapter([""], seen), OPENAI, "a girl at a cafe");
    expect(seen).toHaveLength(0);
    expect(result.derivedImagePrompt).toContain(MIRA.visualTags);
  });
});

describe("parseSceneReply", () => {
  it("also reads the older PROMPT/SUMMARY labels", () => {
    expect(parseSceneReply("PROMPT:\na cafe\n\nSUMMARY:\nHi!", "hey")).toEqual({ scene: "a cafe", reply: "Hi!" });
  });
});

test("hiding the image-context tag keeps a note after it (2026-10-27)", () => {
  const { stripImageContextTag } = require("./imageGeneration");
  expect(stripImageContextTag("Here's me! [Image Context: Aria waving]\n\n[Note: the picture was toned down to level 1.]")).toBe("Here's me!\n\n[Note: the picture was toned down to level 1.]");
  expect(stripImageContextTag("Here's me! [Image Context: Aria waving]")).toBe("Here's me!");
});
