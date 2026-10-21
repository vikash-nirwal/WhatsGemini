import { NoWebGPUError, onWebLLMProgress, resetWebLLMEngine, webllmAdapter } from "./webllmAdapter";

const mockCreate = jest.fn();
const mockCreateEngine = jest.fn();

jest.mock("./webllmLoader", () => ({ loadWebLLM: async () => ({ CreateMLCEngine: (...args: any[]) => mockCreateEngine(...args) }) }));

const setGPU = (on: boolean, adapter: unknown = {}) =>
  Object.defineProperty(navigator, "gpu", { value: on ? { requestAdapter: async () => adapter } : undefined, configurable: true });

beforeEach(() => {
  resetWebLLMEngine();
  mockCreate.mockReset();
  mockCreateEngine.mockReset();
  mockCreateEngine.mockImplementation(async (_model: string, cfg: any) => {
    cfg?.initProgressCallback?.({ progress: 0.5, text: "Fetching", timeElapsed: 1 });
    return { chat: { completions: { create: mockCreate } }, interruptGenerate: jest.fn() };
  });
  setGPU(true);
});

describe("webllmAdapter", () => {
  it("sends the system prompt, history and prompt, and reports usage", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: " Hello! " } }], usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } });
    const result = await webllmAdapter.generateChat(
      { model: "Llama-3.2-3B-Instruct-q4f16_1-MLC", systemInstruction: "Be Aria.", history: [{ role: "user", text: "hi" }, { role: "assistant", text: "hey" }], prompt: "how are you?", temperature: 0.7 },
      {}
    );
    expect(result).toEqual({ text: " Hello! ", usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 } });
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      messages: [
        { role: "system", content: "Be Aria." },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hey" },
        { role: "user", content: "how are you?" },
      ],
      temperature: 0.7,
      stream: false,
    });
  });

  it("streams tokens, and loads the model only once", async () => {
    mockCreate.mockImplementation(async () => ({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: "Hel" } }] };
        yield { choices: [{ delta: { content: "lo" } }] };
        yield { choices: [], usage: { prompt_tokens: 1, completion_tokens: 2 } };
      },
    }));
    const seen: string[] = [];
    const progress: number[] = [];
    const stop = onWebLLMProgress((p) => progress.push(p.progress));
    const opts = { model: "m", history: [], prompt: "x", onToken: (t: string) => seen.push(t) };
    const result = await webllmAdapter.generateChat(opts, {});
    await webllmAdapter.generateChat(opts, {});
    stop();
    expect(result.text).toBe("Hello");
    expect(seen.slice(0, 2)).toEqual(["Hel", "Hello"]);
    expect(mockCreateEngine).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("explains a browser without WebGPU", async () => {
    setGPU(false);
    await expect(webllmAdapter.generateOnce("hi", "m", {})).rejects.toBeInstanceOf(NoWebGPUError);
    expect(mockCreateEngine).not.toHaveBeenCalled();
  });

  it("treats WebGPU with no GPU behind it as missing", async () => {
    setGPU(true, null);
    await expect(webllmAdapter.generateOnce("hi", "m", {})).rejects.toBeInstanceOf(NoWebGPUError);
    expect(mockCreateEngine).not.toHaveBeenCalled();
  });
});
