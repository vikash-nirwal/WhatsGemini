import { cleanModelOverride, isEmptyModelOverride, resolveTurnModel } from "./modelResolution";
import { PROVIDER_CHAT_MODELS } from "../../utils/constants";

const settings = { chatProvider: "openai", selectedModel: "gpt-4.1", temperature: 0.7, samplers: { topP: 0.9, frequencyPenalty: 0.3 } };

describe("resolveTurnModel", () => {
  it("uses the app settings when there's no character or override", () => {
    const expected = { provider: "openai", model: "gpt-4.1", temperature: 0.7, samplers: { topP: 0.9, frequencyPenalty: 0.3 }, overridden: false };
    expect(resolveTurnModel(settings)).toEqual(expected);
    expect(resolveTurnModel(settings, {})).toEqual(expected);
    expect(resolveTurnModel(settings, { modelOverride: {} })).toEqual(expected);
  });

  it("uses the character's provider, model and temperature", () => {
    expect(resolveTurnModel(settings, { modelOverride: { provider: "anthropic", model: "claude-sonnet-4-5", temperature: 1 } })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      temperature: 1,
      samplers: settings.samplers,
      overridden: true,
    });
  });

  it("takes the provider's first model when only a provider is set", () => {
    expect(resolveTurnModel(settings, { modelOverride: { provider: "deepseek" } })).toMatchObject({
      provider: "deepseek",
      model: PROVIDER_CHAT_MODELS.deepseek[0],
      overridden: true,
    });
  });

  it("keeps the app's model when the override names the app's own provider", () => {
    expect(resolveTurnModel(settings, { modelOverride: { provider: "openai" } })).toMatchObject({ provider: "openai", model: "gpt-4.1", overridden: false });
    expect(resolveTurnModel(settings, { modelOverride: { provider: "openai", model: "gpt-4o" } })).toMatchObject({ model: "gpt-4o", overridden: true });
  });

  it("changes only the model when no provider is set", () => {
    expect(resolveTurnModel(settings, { modelOverride: { model: " gpt-4o-mini " } })).toMatchObject({ provider: "openai", model: "gpt-4o-mini" });
  });

  it("accepts Ollama with a typed model, and ignores it without one", () => {
    expect(resolveTurnModel(settings, { modelOverride: { provider: "ollama", model: "llama3.1" } })).toMatchObject({ provider: "ollama", model: "llama3.1" });
    expect(resolveTurnModel(settings, { modelOverride: { provider: "ollama" } })).toMatchObject({ provider: "openai", model: "gpt-4.1", overridden: false });
  });

  it("ignores an unknown provider, along with its model", () => {
    expect(resolveTurnModel(settings, { modelOverride: { provider: "nope", model: "x" } })).toMatchObject({ provider: "openai", model: "gpt-4.1", overridden: false });
  });

  it("keeps a temperature of 0 and merges samplers key by key", () => {
    const result = resolveTurnModel(settings, { modelOverride: { temperature: 0, samplers: { topP: 0.5, topK: 40, presencePenalty: undefined } } });
    expect(result.temperature).toBe(0);
    expect(result.samplers).toEqual({ topP: 0.5, topK: 40, frequencyPenalty: 0.3 });
    expect(result.overridden).toBe(true);
  });
});

describe("isEmptyModelOverride", () => {
  it("is true for nothing, blanks and unset samplers", () => {
    expect(isEmptyModelOverride(undefined)).toBe(true);
    expect(isEmptyModelOverride({ provider: " ", model: "", samplers: { topP: undefined } })).toBe(true);
  });

  it("is false once anything is set", () => {
    expect(isEmptyModelOverride({ temperature: 0 })).toBe(false);
    expect(isEmptyModelOverride({ samplers: { topK: 1 } })).toBe(false);
    expect(isEmptyModelOverride({ provider: "gemini" })).toBe(false);
  });
});

describe("cleanModelOverride", () => {
  it("trims, drops blanks and returns undefined when nothing is left", () => {
    expect(cleanModelOverride({ provider: " anthropic ", model: "", temperature: 0.2, samplers: { topP: undefined, topK: 20 } })).toEqual({
      provider: "anthropic",
      temperature: 0.2,
      samplers: { topK: 20 },
    });
    expect(cleanModelOverride({ provider: "", samplers: {} })).toBeUndefined();
  });
});
