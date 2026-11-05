import { characterLoraFile, defaultLoraName, findLora, loraBaseName } from "./loras";

// A character's LoRA in ComfyUI (2026-11-05): their first name in lowercase
// by default, when ComfyUI has it.

const INSTALLED = ["characters/Mira.safetensors", "aria_v2.safetensors", "style/film-grain.pt"];

test("matches LoRAs by name, in any folder and case", () => {
  expect(loraBaseName("characters/Mira.safetensors")).toBe("mira");
  expect(defaultLoraName("  Mira Voss ")).toBe("mira");
  expect(defaultLoraName("")).toBeUndefined();
  expect(findLora(INSTALLED, "mira")).toBe("characters/Mira.safetensors");
  expect(findLora(INSTALLED, "aria_v2.safetensors")).toBe("aria_v2.safetensors");
  expect(findLora(INSTALLED, "kai")).toBeUndefined();
});

test("uses the first-name LoRA only when it's installed", () => {
  expect(characterLoraFile(undefined, "Mira Voss", INSTALLED)).toBe("characters/Mira.safetensors");
  expect(characterLoraFile(undefined, "Kai", INSTALLED)).toBeUndefined();
  expect(characterLoraFile(undefined, undefined, INSTALLED)).toBeUndefined();
});

test("a picked LoRA wins, and None means none", () => {
  expect(characterLoraFile({ loraName: "aria_v2" }, "Mira", INSTALLED)).toBe("aria_v2.safetensors");
  // One ComfyUI doesn't list is still sent as typed, as before.
  expect(characterLoraFile({ loraName: "new_one" }, "Mira", [])).toBe("new_one.safetensors");
  expect(characterLoraFile({ noLora: true }, "Mira", INSTALLED)).toBeUndefined();
});
