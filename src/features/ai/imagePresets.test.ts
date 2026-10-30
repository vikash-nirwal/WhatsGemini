import { applyPresetStorage, capturePreset, imageSetupFor, isCurrentPreset, withPreset } from "./imagePresets";

const harm = { harassment: "BLOCK_NONE", hate_speech: "BLOCK_NONE", sexual: "BLOCK_NONE", dangerous: "BLOCK_NONE" };
const setup = { imageProvider: "fal", imageModel: "fal-ai/flux-kontext/dev", imageGenPrompt: "cinematic", safetySettings: { ...harm, falSafetyChecker: "adults" as const } };

afterEach(() => localStorage.clear());

test("a preset keeps the whole setup, and a model tried in the playground", () => {
  localStorage.setItem("image_tone_level", "1");
  const p = capturePreset(" Kontext ", setup);
  expect(p).toMatchObject({ name: "Kontext", provider: "fal", model: "fal-ai/flux-kontext/dev", basePrompt: "cinematic", falSafetyChecker: "adults", toneLevel: 1, toneRetry: true });
  expect(p.falLora).toBeUndefined();
  expect(capturePreset("Tried", setup, "fal-ai/flux-pulid").model).toBe("fal-ai/flux-pulid");
});

test("fal's SDXL presets keep the checkpoint and LoRAs", () => {
  localStorage.setItem("fal_lora_settings", JSON.stringify({ checkpoint: "someone/xl", loras: [{ path: "a", scale: 0.7 }] }));
  expect(capturePreset("SDXL", { ...setup, imageModel: "fal-ai/lora" }).falLora).toMatchObject({ checkpoint: "someone/xl", loras: [{ path: "a", scale: 0.7 }] });
});

test("saving under a used name replaces that preset", () => {
  const a = capturePreset("Anime", setup);
  const list = withPreset([a], { ...capturePreset("anime", setup), basePrompt: "new" });
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ id: a.id, basePrompt: "new" });
});

test("a preset shows as chosen only while the settings match it", () => {
  const p = capturePreset("Kontext", setup);
  expect(isCurrentPreset(p, setup)).toBe(true);
  expect(isCurrentPreset(p, { ...setup, imageGenPrompt: "other" })).toBe(false);
  applyPresetStorage({ ...p, toneLevel: 2 });
  expect(isCurrentPreset(p, setup)).toBe(false);
});

test("a character's preset replaces Settings for their pictures, until it's gone", () => {
  localStorage.setItem("image_presets", JSON.stringify([{ id: "p1", name: "SDXL", provider: "fal", model: "fal-ai/lora", basePrompt: "anime", falSafetyChecker: false, toneLevel: 2, toneRetry: false, falLora: { checkpoint: "someone/xl", loras: [] } }]));
  const { settings, overrides } = imageSetupFor(setup, "p1");
  expect(settings).toMatchObject({ imageProvider: "fal", imageModel: "fal-ai/lora", imageGenPrompt: "anime", safetySettings: { ...harm, falSafetyChecker: false } });
  expect(overrides).toMatchObject({ tone: { level: 2, retry: false }, falLora: { checkpoint: "someone/xl", keepFace: true } });
  expect(imageSetupFor(setup, "deleted")).toEqual({ settings: setup });
  expect(imageSetupFor(setup, undefined)).toEqual({ settings: setup });
});

test("a preset keeps its model's content test result and brings it back", () => {
  const tested = { level: 2 as const, guidance: "Cover nudity with fabric.", label: "fal · kontext", at: 1 };
  localStorage.setItem("image_calibrations", JSON.stringify({ "fal:fal-ai/flux-kontext/dev": tested }));
  const p = capturePreset("Kontext tested", setup);
  expect(p.calibration).toEqual(tested);
  // Forgotten, then the preset is picked again: the result is back.
  localStorage.removeItem("image_calibrations");
  applyPresetStorage(p);
  expect(JSON.parse(localStorage.getItem("image_calibrations") || "{}")["fal:fal-ai/flux-kontext/dev"]).toEqual(tested);
  // A character with this preset uses it for their pictures.
  localStorage.setItem("image_presets", JSON.stringify([p]));
  expect(imageSetupFor(setup, p.id).overrides?.calibration).toEqual(tested);
});
