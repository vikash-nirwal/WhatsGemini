import { generatedMessageFor, imageSettingsOf } from "./imageSettings";

describe("imageSettings", () => {
  it("keeps only what the message knows", () => {
    expect(imageSettingsOf({ imageParams: { seed: 3, steps: 20, cfg_scale: 7, width: 512, height: 768 }, sampler_name: "Euler a" })).toEqual({ seed: 3, steps: 20, cfg: 7, sampler: "Euler a", width: 512, height: 768 });
    expect(imageSettingsOf({})).toEqual({});
  });

  it("finds the generated message a picture belongs to", () => {
    const messages = [
      { role: "you", images: ["data:image/png;base64,AAA"] },
      { role: "ai", images: ["data:image/png;base64,BBB"], imagePrompt: "a lighthouse" },
    ];
    expect(generatedMessageFor(messages, "data:image/png;base64,BBB", "you")?.imagePrompt).toBe("a lighthouse");
    expect(generatedMessageFor(messages, "data:image/png;base64,AAA", "you")).toBeUndefined();
    expect(generatedMessageFor(messages, null, "you")).toBeUndefined();
  });
});
