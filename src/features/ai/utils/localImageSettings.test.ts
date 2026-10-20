import { applyLocalImageSettings, cleanLocalImageSettings } from "./localImageSettings";

describe("applyLocalImageSettings", () => {
  it("leaves prompt and params alone without settings", () => {
    expect(applyLocalImageSettings("1girl, cafe", { steps: 20 }, undefined)).toEqual({ prompt: "1girl, cafe", params: { steps: 20 } });
  });

  it("puts the LoRA tag and trigger word first and pins the seed", () => {
    const result = applyLocalImageSettings("1girl, cafe", { steps: 20, seed: 5 }, { loraName: "mira_v2.safetensors", loraWeight: 0.7, loraTrigger: "mira_char", seed: 1234 });
    expect(result.prompt).toBe("<lora:mira_v2:0.7>, mira_char, 1girl, cafe");
    expect(result.params).toEqual({ steps: 20, seed: 1234 });
  });

  it("uses a default LoRA weight and doesn't repeat a trigger already in the prompt", () => {
    expect(applyLocalImageSettings("mira_char at a cafe", {}, { loraName: "mira", loraTrigger: "Mira_Char" }).prompt).toBe("<lora:mira:0.8>, mira_char at a cafe");
  });
});

describe("cleanLocalImageSettings", () => {
  it("drops blanks and returns undefined when empty", () => {
    expect(cleanLocalImageSettings({ loraName: "  ", loraTrigger: "", seed: NaN })).toBeUndefined();
    expect(cleanLocalImageSettings({ loraName: " mira ", loraWeight: 0.9, referenceMode: "reactor", reactorFaceModel: "mira.safetensors", seed: 42 })).toEqual({
      loraName: "mira", loraWeight: 0.9, referenceMode: "reactor", reactorFaceModel: "mira", seed: 42,
    });
  });

  it("drops a weight without a LoRA", () => {
    expect(cleanLocalImageSettings({ loraWeight: 0.5 })).toBeUndefined();
  });
});
