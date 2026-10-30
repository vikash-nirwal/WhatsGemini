import { AISafetySettings } from "../../types";
import { DEFAULT_FAL_LORA, FalLoraSettings, loadFalLora, saveFalLora } from "./providers/falLora";
import { saveTone, toneLevel, ToneLevel, toneRetryOn } from "./utils/imageTone";
import { calibrationKey, ImageCalibration, loadCalibration, saveCalibration } from "./utils/imageCalibration";

// Image presets (the user's ask, 2026-10-30): a whole picture setup under a
// name, saved from the image playground or Settings and switched to from
// either. API keys aren't in it: each provider keeps its own.

export interface ImagePreset {
  id: string;
  name: string;
  provider: string;
  model: string;
  basePrompt: string;
  falSafetyChecker?: boolean | "adults";
  toneLevel: ToneLevel;
  toneRetry: boolean;
  falLora?: FalLoraSettings; // only for fal's SDXL model
  // The content test's result for this model (imageCalibration.ts): its
  // level and rules travel with the preset (the user's ask, 2026-10-30).
  calibration?: ImageCalibration;
}

// The settings a preset reads and sets; the rest of the settings stay put.
export interface ImageSetup {
  imageProvider: string;
  imageModel: string;
  imageGenPrompt: string;
  safetySettings: AISafetySettings;
}

const LS_PRESETS = "image_presets";

export const loadPresets = (): ImagePreset[] => {
  try {
    const list = JSON.parse(localStorage.getItem(LS_PRESETS) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const PRESETS_CHANGED = "image-presets-changed";

// Pickers on the same page (the playground's setup card, its content test)
// hear about a save and show it.
export const savePresets = (presets: ImagePreset[]) => {
  try {
    localStorage.setItem(LS_PRESETS, JSON.stringify(presets));
  } catch {
    // Storage full or blocked: the presets last until the page closes.
  }
  window.dispatchEvent(new Event(PRESETS_CHANGED));
};

// The current setup as a preset. A model tried in the playground can stand
// in for the one in Settings.
export const capturePreset = (name: string, setup: ImageSetup, model?: string): ImagePreset => {
  const usedModel = model?.trim() || setup.imageModel;
  const tested = loadCalibration(calibrationKey(setup.imageProvider, usedModel));
  return {
    id: `p${Date.now().toString(36)}`,
    name: name.trim(),
    provider: setup.imageProvider,
    model: usedModel,
    basePrompt: setup.imageGenPrompt,
    ...(setup.safetySettings.falSafetyChecker !== undefined ? { falSafetyChecker: setup.safetySettings.falSafetyChecker } : {}),
    toneLevel: toneLevel(),
    toneRetry: toneRetryOn(),
    ...(setup.imageProvider === "fal" && usedModel === "fal-ai/lora" ? { falLora: loadFalLora() } : {}),
    ...(tested ? { calibration: tested } : {}),
  };
};

// Saving under a name already used replaces that preset.
export const withPreset = (presets: ImagePreset[], preset: ImagePreset): ImagePreset[] => {
  const same = presets.find((p) => p.name.toLowerCase() === preset.name.toLowerCase());
  return same ? presets.map((p) => (p.id === same.id ? { ...preset, id: same.id } : p)) : [...presets, preset];
};

// Whether the settings are this preset right now, to show it as chosen.
export const isCurrentPreset = (preset: ImagePreset, setup: ImageSetup): boolean =>
  preset.provider === setup.imageProvider &&
  preset.model === setup.imageModel &&
  preset.basePrompt === setup.imageGenPrompt &&
  (preset.falSafetyChecker ?? true) === (setup.safetySettings.falSafetyChecker ?? true) &&
  preset.toneLevel === toneLevel() &&
  preset.toneRetry === toneRetryOn() &&
  (!preset.falLora || JSON.stringify(preset.falLora) === JSON.stringify(loadFalLora()));

// What applying a preset changes outside Redux; the caller dispatches the
// returned settings changes.
export const applyPresetStorage = (preset: ImagePreset) => {
  saveTone(preset.toneLevel, preset.toneRetry);
  if (preset.falLora) saveFalLora({ ...DEFAULT_FAL_LORA, ...preset.falLora });
  // Its test result comes back with it, for its model.
  if (preset.calibration) saveCalibration(calibrationKey(preset.provider, preset.model, preset.falLora?.checkpoint), preset.calibration);
};

// What a preset sets that isn't in Redux, for one picture.
export interface ImageOverrides {
  tone?: { level: ToneLevel; retry: boolean };
  falLora?: FalLoraSettings;
  calibration?: ImageCalibration;
}

export const presetById = (id: string | undefined): ImagePreset | undefined => (id ? loadPresets().find((p) => p.id === id) : undefined);

// The image settings for a character's pictures (2026-10-30): their own
// preset, while it exists, in place of Settings. A deleted preset falls
// back to Settings.
export const imageSetupFor = <S extends ImageSetup>(settings: S, presetId: string | undefined): { settings: S; overrides?: ImageOverrides } => {
  const preset = presetById(presetId);
  if (!preset) return { settings };
  return {
    settings: { ...settings, imageProvider: preset.provider, imageModel: preset.model, imageGenPrompt: preset.basePrompt, safetySettings: { ...settings.safetySettings, falSafetyChecker: preset.falSafetyChecker } },
    overrides: { tone: { level: preset.toneLevel, retry: preset.toneRetry }, ...(preset.falLora ? { falLora: { ...DEFAULT_FAL_LORA, ...preset.falLora } } : {}), ...(preset.calibration ? { calibration: preset.calibration } : {}) },
  };
};
