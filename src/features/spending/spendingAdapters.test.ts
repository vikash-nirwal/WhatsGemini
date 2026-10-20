import { withChatSpending, withImageSpending, withVideoSpending } from "./spendingAdapters";
import { getSpendingSnapshot, monthKey, resetSpendingStore, setBudget } from "./spending";
import { ChatProviderAdapter, ImageProviderAdapter, VideoProviderAdapter } from "../ai/providers/types";

const capabilities = { supportsImageGen: false, requiresApiKey: true, requiresBaseUrl: false };

const fakeChat = (id: string, usage?: { inputTokens: number; outputTokens: number; totalTokens: number }): ChatProviderAdapter => ({
  id,
  capabilities,
  generateChat: jest.fn(async () => ({ text: "a".repeat(400), usage })),
  generateOnce: jest.fn(async () => ({ text: "done", usage })),
});

const thisMonth = () => getSpendingSnapshot().ledger[monthKey()] || {};

beforeEach(() => {
  localStorage.clear();
  resetSpendingStore();
});

describe("withChatSpending", () => {
  it("records reported usage for both kinds of call", async () => {
    const adapter = withChatSpending(fakeChat("openai", { inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 }));
    await adapter.generateChat({ model: "gpt-4o", history: [], prompt: "hi" }, {});
    await adapter.generateOnce("summarize", "gpt-4o", {});
    expect(thisMonth().openai.calls).toBe(2);
    expect(thisMonth().openai.tokens).toBe(4000);
    // gpt-4o: $2.50 in, $10 out per million tokens.
    expect(thisMonth().openai.cost).toBeCloseTo(2 * (0.0025 + 0.01));
  });

  it("estimates from text length when the provider reports no usage", async () => {
    const adapter = withChatSpending(fakeChat("openrouter"));
    await adapter.generateChat({ model: "x", systemInstruction: "s".repeat(400), history: [{ role: "user", text: "h".repeat(400) }], prompt: "p".repeat(400) }, {});
    // 1200 input characters and 400 output characters at ~4 per token.
    expect(thisMonth().openrouter.tokens).toBe(400);
    expect(thisMonth().openrouter.cost).toBeGreaterThan(0);
  });

  it("stops paid calls before they're sent once a hard limit is reached", async () => {
    setBudget({ monthlyLimit: 1, mode: "block" });
    const raw = fakeChat("anthropic", { inputTokens: 0, outputTokens: 100_000, totalTokens: 100_000 });
    const adapter = withChatSpending(raw);
    // claude-sonnet-4-5 output is $15 per million: $1.50, over the limit.
    await adapter.generateChat({ model: "claude-sonnet-4-5", history: [], prompt: "hi" }, {});
    await expect(adapter.generateOnce("again", "claude-sonnet-4-5", {})).rejects.toThrow(/Monthly spending limit reached/);
    expect(raw.generateOnce).not.toHaveBeenCalled();
  });

  it("never blocks or records Ollama", async () => {
    setBudget({ monthlyLimit: 1, mode: "block" });
    await withChatSpending(fakeChat("anthropic", { inputTokens: 0, outputTokens: 100_000, totalTokens: 100_000 })).generateOnce("x", "claude-sonnet-4-5", {});
    const ollama = withChatSpending(fakeChat("ollama", { inputTokens: 10, outputTokens: 10, totalTokens: 20 }));
    await expect(ollama.generateChat({ model: "llama3", history: [], prompt: "hi" }, {})).resolves.toBeTruthy();
    expect(thisMonth().ollama).toBeUndefined();
  });
});

describe("withImageSpending and withVideoSpending", () => {
  const image = (id: string, images: string[]): ImageProviderAdapter => ({
    id,
    capabilities: { requiresApiKey: true, requiresBaseUrl: false },
    generateImage: jest.fn(async () => ({ images })),
  });

  it("charges a flat price per picture when there's no usage", async () => {
    await withImageSpending(image("fal", ["data:a", "data:b"])).generateImage({ model: "seedream", prompt: "cat" }, {});
    expect(thisMonth().fal).toMatchObject({ calls: 1, byKind: { image: 0.08 } });
  });

  it("records nothing when no picture came back", async () => {
    await withImageSpending(image("wan", [])).generateImage({ model: "wan", prompt: "cat" }, {});
    expect(thisMonth().wan).toBeUndefined();
  });

  it("lets ComfyUI through a hard stop", async () => {
    setBudget({ monthlyLimit: 0.01, mode: "block" });
    await withImageSpending(image("fal", ["data:a"])).generateImage({ model: "seedream", prompt: "cat" }, {});
    await expect(withImageSpending(image("fal", ["data:a"])).generateImage({ model: "seedream", prompt: "cat" }, {})).rejects.toThrow();
    await expect(withImageSpending(image("comfyui", ["data:a"])).generateImage({ model: "", prompt: "cat" }, {})).resolves.toEqual({ images: ["data:a"] });
  });

  it("records videos", async () => {
    const video: VideoProviderAdapter = {
      id: "wan",
      capabilities: { requiresApiKey: true, requiresBaseUrl: true },
      generateVideo: jest.fn(async () => ({ videos: ["https://example.com/v.mp4"] })),
    };
    await withVideoSpending(video).generateVideo({ model: "wan2.5-t2v", prompt: "waves" }, {});
    expect(thisMonth().wan).toMatchObject({ cost: 0.5, byKind: { video: 0.5 } });
  });
});
