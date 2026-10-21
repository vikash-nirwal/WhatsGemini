import { chooseTemplate, findTemplate, loadComfySettings, loadCustomWorkflows, REFERENCE_MODE_TEMPLATES, templateOptionsFor } from "../comfyui/settings";

// Each image model wants its prompt written its own way: Stable Diffusion 1.5
// reads comma-separated tags, Pony and Illustrious need their own lead-in
// tags, while FLUX and the hosted models (OpenAI, Seedream, Wan, CogView)
// read plain prose and do worse with tag soup. The text model writes the
// prompt, so it's told which of these it's writing for.

export type PromptDialect = "sd15" | "sdxl" | "pony" | "illustrious" | "flux" | "prose";

export interface ImagePromptTarget {
  dialect: PromptDialect;
  // What the prompt is for, in words, e.g. "ComfyUI running FLUX.1 Kontext dev".
  engine: string;
  // Tag-style dialects get tag-style appearance locks (#34) and are worth
  // rewording even a fixed prompt for (portraits, backdrops).
  tags: boolean;
  // How to write it.
  guide: string;
  // Only the SD WebUI takes sampler, steps and size from the prompt writer.
  wantsParams: boolean;
}

// How Settings names each style.
export const DIALECT_LABELS: Record<PromptDialect, string> = {
  sd15: "Stable Diffusion 1.5 tags",
  sdxl: "SDXL phrases",
  pony: "Pony score tags",
  illustrious: "Illustrious / NoobAI tags",
  flux: "FLUX prose",
  prose: "A prose paragraph",
};

const GUIDES: Record<PromptDialect, string> = {
  sd15: "Write comma-separated tags, most important first, never sentences. Start with quality tags (masterpiece, best quality, highly detailed), then who is in it (1girl, 1boy, 2girls, solo), then their appearance (hair colour and style, eye colour, build), outfit, expression, pose and action, the setting, lighting and framing (close-up, upper body, full body, from above). 25 to 50 tags. Weight only the one or two things that must show, like (red scarf:1.2).",
  sdxl: "Write short comma-separated phrases, most important first, never full sentences: who is in it, their appearance, outfit, expression, pose and action, the setting, lighting, framing and camera, then the style. Short descriptive phrases (\"soft window light\", \"sitting on a windowsill\") work better than single words. A couple of quality words (high quality, detailed) are enough. Under 60 words.",
  pony: "This is a Pony Diffusion model. Start with \"score_9, score_8_up, score_7_up\", then a source tag (source_anime, source_cartoon or source_furry, matching the art style; leave it out for realistic styles), then a rating tag that matches the scene (rating_safe, rating_questionable or rating_explicit). Then booru-style tags, never sentences: 1girl or 1boy, solo, appearance, outfit, expression, pose and action, setting, lighting, framing.",
  illustrious: "This is an Illustrious or NoobAI anime model. Start with \"masterpiece, best quality, amazing quality, very aesthetic, absurdres\", then Danbooru tags, never sentences: 1girl or 1boy, solo, appearance (hair, eyes), outfit, expression, pose and action, setting, lighting, framing (upper body, cowboy shot, full body).",
  flux: "Write natural-language prose, two to four sentences, as if describing a photo to someone who can't see it: who is in it and what they're doing first, then their appearance and outfit, expression, the setting, lighting, framing and lens, and the style. No tag lists, no weights, no quality-tag strings, and no negative wording (\"no blur\"): there's no negative prompt, so only say what should be there.",
  prose: "Write one detailed natural-language paragraph of 60 to 120 words, like briefing an illustrator or photographer: who is in it and what they're doing, their appearance and outfit, expression, the setting, lighting, framing and the style. Concrete visual details only; no tag lists or weights. Only put text in the picture if the scene needs it, written in quotes.",
};

// What a checkpoint's file name says about the model behind it.
export const dialectForCheckpoint = (name: string | undefined, fallback: PromptDialect = "sd15"): PromptDialect => {
  const n = (name || "").toLowerCase();
  if (!n) return fallback;
  if (n.includes("flux") || n.includes("kontext")) return "flux";
  if (n.includes("pony")) return "pony";
  if (/illustrious|noob|\bil[_-]|wai[_-]?ani/.test(n)) return "illustrious";
  if (/xl|sdxl|juggernaut|realvis|dreamshaper[_-]?xl|playground|animagine/.test(n)) return "sdxl";
  if (/1\.5|sd15|v1-5|sd_1/.test(n)) return "sd15";
  return fallback;
};

const target = (dialect: PromptDialect, engine: string, wantsParams = false): ImagePromptTarget => ({
  dialect,
  engine,
  tags: dialect !== "flux" && dialect !== "prose",
  guide: GUIDES[dialect],
  wantsParams,
});

export interface TargetInput {
  providerId: string;
  imageModel?: string;
  sdWebuiModel?: string;
  hasReference?: boolean;
  referenceMode?: string; // the character's local reference mode (#40), which picks a ComfyUI template
  isVideo?: boolean;
}

export const resolveImagePromptTarget = ({ providerId, imageModel, sdWebuiModel, hasReference = false, referenceMode, isVideo }: TargetInput): ImagePromptTarget => {
  if (isVideo) {
    return { ...target("prose", "Wan text-to-video"), guide: `${GUIDES.prose} Also say how things move over the few seconds of the clip, and how the camera moves (a slow push in, a pan, handheld).` };
  }
  const model = imageModel || "";
  switch (providerId) {
    case "sdwebui": {
      const dialect = dialectForCheckpoint(sdWebuiModel);
      return target(dialect, `Stable Diffusion WebUI${sdWebuiModel ? ` with the checkpoint "${sdWebuiModel}"` : " (SD 1.5)"}`, true);
    }
    case "comfyui": {
      try {
        const settings = loadComfySettings();
        const customs = loadCustomWorkflows();
        const modeTemplate = hasReference && referenceMode ? REFERENCE_MODE_TEMPLATES[referenceMode] : undefined;
        const template = (modeTemplate && findTemplate(modeTemplate, customs)) || chooseTemplate(settings, hasReference, customs);
        const { checkpoint } = templateOptionsFor(settings, template);
        const byTemplate: PromptDialect = /flux/i.test(`${template.id} ${template.label}`) ? "flux" : "sdxl";
        const dialect = byTemplate === "flux" ? "flux" : dialectForCheckpoint(checkpoint, settings.baseSize <= 768 ? "sd15" : "sdxl");
        return target(dialect, `ComfyUI running the "${template.label}" workflow${checkpoint ? ` with "${checkpoint}"` : ""}`);
      } catch {
        return target("sdxl", "ComfyUI");
      }
    }
    case "fal":
      return target(/flux|kontext/i.test(model) ? "flux" : "prose", `fal.ai ${model.includes("seedream") ? "Seedream" : model || "image model"}`);
    case "openai":
      return target("prose", `OpenAI ${model || "gpt-image-1"}`);
    case "wan":
      return target("prose", `Alibaba Wan (${model || "wan2.7-image"})`);
    case "glm":
      return target("prose", `Zhipu ${model.includes("cogview") ? "CogView" : "GLM-Image"}`);
    default:
      return target("prose", model || providerId);
  }
};

// The instruction for a prompt-writing call: a plain description of the
// picture in, a prompt for this engine out.
export const buildImagePromptRequest = ({
  target: t,
  scene,
  baseStyle,
  artStyleClause,
  lockInstruction,
  extra,
}: {
  target: ImagePromptTarget;
  scene: string;
  baseStyle?: string;
  artStyleClause?: string;
  lockInstruction?: string;
  extra?: string;
}): string =>
  [
    `You write prompts for an image generator: ${t.engine}.`,
    `The picture to make:\n"""\n${scene.trim()}\n"""`,
    [baseStyle?.trim() ? `Always follow this style rule: ${baseStyle.trim()}` : "", artStyleClause ? `Art style: ${artStyleClause}.` : ""].filter(Boolean).join("\n"),
    lockInstruction || "",
    extra || "",
    `How to write it for this model: ${t.guide}`,
    t.wantsParams
      ? `Reply in exactly this format:\nPROMPT:\n<the prompt>\nPARAMS:\n<a JSON object with the best "steps" (15-40), "cfg_scale" (1-15), "sampler_name", "width" and "height" for this checkpoint and subject, e.g. portrait 832x1216 for SDXL or 512x768 for SD 1.5; {} if the defaults are fine>`
      : "Reply with only the prompt: no label, quotes or explanation.",
  ]
    .filter(Boolean)
    .join("\n\n");

// Reads the prompt (and SD WebUI params) back out of the reply.
export const parseImagePromptReply = (reply: string, wantsParams: boolean): { prompt: string; params: Record<string, unknown> } => {
  let text = reply.trim().replace(/^```[a-z]*\s*|```\s*$/gi, "").trim();
  let params: Record<string, unknown> = {};
  if (wantsParams) {
    const match = text.match(/PARAMS:\s*([\s\S]*)$/i);
    if (match) {
      try {
        params = JSON.parse(match[1].trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "")) || {};
      } catch {
        params = {};
      }
      text = text.slice(0, match.index).trim();
    }
  }
  // Models used to the older one-call format sometimes add a reply section.
  const extra = text.search(/\n\s*(SUMMARY|REPLY|SCENE):/i);
  if (extra > 0) text = text.slice(0, extra);
  const prompt = text.replace(/^PROMPT:\s*/i, "").trim().replace(/^["“]|["”]$/g, "").trim();
  return { prompt, params };
};
