import { FAL_LORA_ENDPOINT, loadFalLora } from "../providers/falLora";
import { ToneLevel } from "./imageTone";

// The content test (the user's ask, 2026-10-30): the playground sends one
// adult test picture to the image model at each tone-down level until it's
// drawn, then the text model compares what was refused with what was drawn
// and writes a few rules for this model. Every picture prompt for the model
// then follows those rules, and starts at the level that worked, so fewer
// pictures are refused and redrawn.

export interface ImageCalibration {
  level: ToneLevel; // the first level the model drew
  guidance?: string; // how to write prompts it accepts
  blockedAll?: boolean; // it refused even the safe-for-work version
  label: string; // the model it was tested on, for display
  at: number;
}

const LS_CALIBRATIONS = "image_calibrations";

// One result per model: a fal SDXL checkpoint is its own model; a local
// provider's checkpoints share one result.
export const calibrationKey = (providerId: string, imageModel?: string, falCheckpoint?: string): string => {
  if (providerId === "sdwebui" || providerId === "comfyui") return providerId;
  if (providerId === "fal" && imageModel === FAL_LORA_ENDPOINT) return `fal:${FAL_LORA_ENDPOINT}:${(falCheckpoint ?? loadFalLora().checkpoint).trim()}`;
  return `${providerId}:${imageModel || ""}`;
};

const readAll = (): Record<string, ImageCalibration> => {
  try {
    return JSON.parse(localStorage.getItem(LS_CALIBRATIONS) || "{}") || {};
  } catch {
    return {};
  }
};

export const loadCalibration = (key: string): ImageCalibration | undefined => readAll()[key];

export const saveCalibration = (key: string, calibration: ImageCalibration | undefined) => {
  const all = readAll();
  if (calibration) all[key] = calibration;
  else delete all[key];
  try {
    localStorage.setItem(LS_CALIBRATIONS, JSON.stringify(all));
  } catch {
    // Only a convenience: the test can be run again.
  }
};

// The level a picture for this model starts at: the tested one, unless the
// tone-down setting already asks for more.
export const startLevel = (setting: ToneLevel, calibration: ImageCalibration | undefined): ToneLevel =>
  (calibration && calibration.level > setting ? calibration.level : setting);

// The test picture: one adult, nudity without a sexual act, so a model's
// line shows without asking for anything a service bans outright. It never
// has reference photos, so no character's or real person's face is used.
export const DEFAULT_TEST_PROMPT = "Artistic nude portrait of a woman in her thirties lying on rumpled white sheets, bare back and hips to the camera, looking over her shoulder, soft morning window light, shallow depth of field, photographic.";

export const buildCalibrationPrompt = (refused: { level: number; prompt: string }[], accepted: { level: number; prompt: string }, model: string) =>
  [
    `An image model (${model}) refused these prompts on content grounds:`,
    ...refused.map((r) => `Level ${r.level}:\n"""\n${r.prompt}\n"""`),
    `It drew this one, toned down to level ${accepted.level}:\n"""\n${accepted.prompt}\n"""`,
    "Compare them and write two to four short rules for writing prompts this model will draw: what to leave out or cover, which words to avoid and what to say instead. Keep each rule general, so it applies to any scene, not just this one.",
    "Reply with only the rules, one per line, no numbering and no preamble.",
  ].join("\n\n");

export const cleanCalibrationRules = (reply: string): string =>
  reply
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, 4)
    .join(" ")
    .slice(0, 600);

// What the prompt writer is told for a tested model.
export const calibrationGuide = (calibration: ImageCalibration | undefined): string | undefined => {
  if (!calibration?.guidance) return undefined;
  return `This model refuses some content; tested rules for prompts it will draw: ${calibration.guidance}`;
};
