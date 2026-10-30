import { buildCalibrationPrompt, calibrationGuide, calibrationKey, cleanCalibrationRules, loadCalibration, saveCalibration, startLevel } from "./imageCalibration";
import { resolveImagePromptTarget } from "./imagePromptGuide";

afterEach(() => localStorage.clear());

test("one result per model, a fal SDXL checkpoint being its own", () => {
  expect(calibrationKey("fal", "fal-ai/flux-kontext/dev")).toBe("fal:fal-ai/flux-kontext/dev");
  localStorage.setItem("fal_lora_settings", JSON.stringify({ checkpoint: "someone/xl" }));
  expect(calibrationKey("fal", "fal-ai/lora")).toBe("fal:fal-ai/lora:someone/xl");
  expect(calibrationKey("comfyui", "anything")).toBe("comfyui");
});

test("results are saved and forgotten", () => {
  saveCalibration("fal:x", { level: 2, guidance: "Cover nudity.", label: "fal · x", at: 1 });
  expect(loadCalibration("fal:x")?.level).toBe(2);
  saveCalibration("fal:x", undefined);
  expect(loadCalibration("fal:x")).toBeUndefined();
});

test("a tested model starts at its level unless the setting asks for more", () => {
  expect(startLevel(0, { level: 2, label: "", at: 0 })).toBe(2);
  expect(startLevel(3, { level: 2, label: "", at: 0 })).toBe(3);
  expect(startLevel(1, undefined)).toBe(1);
});

test("the analysis gets every refused prompt and the drawn one", () => {
  const ask = buildCalibrationPrompt([{ level: 0, prompt: "nude" }, { level: 1, prompt: "implied" }], { level: 2, prompt: "covered" }, "fal · x");
  expect(ask).toContain("Level 0:");
  expect(ask).toContain("Level 1:");
  expect(ask).toContain("toned down to level 2");
});

test("the rules come back as one short paragraph", () => {
  expect(cleanCalibrationRules("1. Cover nudity with fabric.\n- Avoid the word nude.\n\n• Keep poses relaxed.")).toBe("Cover nudity with fabric. Avoid the word nude. Keep poses relaxed.");
});

test("the prompt writer is told a tested model's rules", () => {
  expect(calibrationGuide({ level: 1, label: "", at: 0 })).toBeUndefined();
  saveCalibration("fal:fal-ai/flux-kontext/dev", { level: 2, guidance: "Cover nudity with fabric.", label: "", at: 0 });
  expect(resolveImagePromptTarget({ providerId: "fal", imageModel: "fal-ai/flux-kontext/dev" }).guide).toContain("Cover nudity with fabric.");
  expect(resolveImagePromptTarget({ providerId: "fal", imageModel: "fal-ai/flux-pulid" }).guide).not.toContain("Cover nudity");
});
