import { modelSeesImages } from "./vision";

describe("modelSeesImages", () => {
  it("knows the providers whose chat models all take images", () => {
    expect(modelSeesImages("gemini", "gemini-2.5-flash")).toBe(true);
    expect(modelSeesImages("anthropic", "claude-haiku-4-5")).toBe(true);
  });

  it("goes by model name elsewhere", () => {
    expect(modelSeesImages("openai", "gpt-4o-mini")).toBe(true);
    expect(modelSeesImages("openai", "gpt-5-mini")).toBe(true);
    expect(modelSeesImages("openai", "gpt-3.5-turbo")).toBe(false);
    expect(modelSeesImages("openrouter", "meta-llama/llama-3.2-11b-vision-instruct")).toBe(true);
    expect(modelSeesImages("openrouter", "mistralai/mistral-nemo")).toBe(false);
    expect(modelSeesImages("qwen", "qwen-vl-max")).toBe(true);
    expect(modelSeesImages("qwen", "qwen-plus")).toBe(false);
    expect(modelSeesImages("glm", "glm-4.5v")).toBe(true);
    expect(modelSeesImages("ollama", "llava:13b")).toBe(true);
    expect(modelSeesImages("ollama", "llama3.1")).toBe(false);
  });

  it("says no for DeepSeek", () => {
    expect(modelSeesImages("deepseek", "deepseek-chat")).toBe(false);
  });
});
