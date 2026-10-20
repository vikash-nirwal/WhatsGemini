import { LocalImageSettings, SDImageParams } from "../../../types";

// Per-character local image settings (#40) applied to a Stable Diffusion
// prompt: the LoRA tag and its trigger word go first, where SD weighs them
// most, and a fixed seed replaces whatever the prompt writer suggested.

const DEFAULT_LORA_WEIGHT = 0.8;

export const applyLocalImageSettings = (
  prompt: string,
  params: SDImageParams,
  settings: LocalImageSettings | undefined
): { prompt: string; params: SDImageParams } => {
  if (!settings) return { prompt, params };
  const front: string[] = [];
  const lora = settings.loraName?.trim().replace(/\.(safetensors|pt|ckpt)$/i, "");
  if (lora) {
    const weight = settings.loraWeight != null && !Number.isNaN(settings.loraWeight) ? settings.loraWeight : DEFAULT_LORA_WEIGHT;
    front.push(`<lora:${lora}:${Number(weight.toFixed(2))}>`);
  }
  const trigger = settings.loraTrigger?.trim();
  if (trigger && !prompt.toLowerCase().includes(trigger.toLowerCase())) front.push(trigger);
  const nextPrompt = front.length > 0 ? `${front.join(", ")}, ${prompt}` : prompt;
  const nextParams = settings.seed != null && Number.isInteger(settings.seed) && settings.seed >= 0 ? { ...params, seed: settings.seed } : params;
  return { prompt: nextPrompt, params: nextParams };
};

// What the editor saves: blank fields dropped, undefined when nothing is set.
export const cleanLocalImageSettings = (settings?: LocalImageSettings): LocalImageSettings | undefined => {
  if (!settings) return undefined;
  const cleaned: LocalImageSettings = {};
  if (settings.seed != null && Number.isInteger(settings.seed) && settings.seed >= 0) cleaned.seed = settings.seed;
  if (settings.loraName?.trim()) cleaned.loraName = settings.loraName.trim();
  if (cleaned.loraName && settings.loraWeight != null && !Number.isNaN(settings.loraWeight)) cleaned.loraWeight = settings.loraWeight;
  if (settings.loraTrigger?.trim()) cleaned.loraTrigger = settings.loraTrigger.trim();
  if (settings.referenceMode) cleaned.referenceMode = settings.referenceMode;
  if (settings.reactorFaceModel?.trim()) cleaned.reactorFaceModel = settings.reactorFaceModel.trim().replace(/\.safetensors$/i, "");
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
};
