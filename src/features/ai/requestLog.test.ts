import {
  REQUEST_LOG_LIMIT,
  clearRequestLog,
  completeRequest,
  failRequest,
  findRequestForReply,
  formatRequestForCopy,
  getRequest,
  getRequestLog,
  splitPostHistoryNote,
  splitSystemSections,
  startRequest,
  subscribeRequestLog,
  withRequestLog,
} from "./requestLog";
import { ChatProviderAdapter } from "./providers/types";

const base = { kind: "chat" as const, provider: "ollama", model: "llama3", history: [], prompt: "Hi" };

beforeEach(() => clearRequestLog());

describe("requestLog", () => {
  it("records a request as pending, then done with the reply and usage", () => {
    const id = startRequest({ ...base, systemInstruction: "Be Kai.", temperature: 0.7 }, 1000);
    expect(getRequest(id)).toMatchObject({ status: "pending", startedAt: 1000, systemInstruction: "Be Kai.", temperature: 0.7 });
    completeRequest(id, "Hello!", { inputTokens: 10, outputTokens: 2, totalTokens: 12 }, 1500);
    expect(getRequest(id)).toMatchObject({ status: "done", response: "Hello!", finishedAt: 1500, usage: { totalTokens: 12 } });
  });

  it("records failures with the error message", () => {
    const id = startRequest(base);
    failRequest(id, new Error("401 Unauthorized"));
    expect(getRequest(id)).toMatchObject({ status: "error", error: "401 Unauthorized" });
  });

  it("keeps only the newest requests, newest first", () => {
    for (let i = 0; i < REQUEST_LOG_LIMIT + 5; i++) startRequest({ ...base, prompt: `p${i}` });
    const log = getRequestLog();
    expect(log).toHaveLength(REQUEST_LOG_LIMIT);
    expect(log[0].prompt).toBe(`p${REQUEST_LOG_LIMIT + 4}`);
  });

  it("copies the history so later changes by the caller don't alter the record", () => {
    const history = [{ role: "user" as const, text: "first" }];
    const id = startRequest({ ...base, history });
    history[0].text = "changed";
    history.push({ role: "user", text: "more" });
    expect(getRequest(id)!.history).toEqual([{ role: "user", text: "first" }]);
  });

  it("notifies subscribers with a new array on every change", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeRequestLog((entries) => seen.push(entries.length));
    const before = getRequestLog();
    const id = startRequest(base);
    completeRequest(id, "ok");
    unsubscribe();
    startRequest(base);
    expect(seen).toEqual([1, 1]);
    expect(getRequestLog()).not.toBe(before);
  });

  it("finds the request behind a stored reply, preferring chat calls", () => {
    const once = startRequest({ ...base, kind: "once" });
    completeRequest(once, "She smiles. [emotion: happy]");
    const chat = startRequest(base);
    completeRequest(chat, "She smiles. [emotion: happy]");
    expect(findRequestForReply("She smiles.")?.id).toBe(chat);
    expect(findRequestForReply("  She smiles. [emotion: happy] ")?.id).toBe(chat);
    expect(findRequestForReply("Something else")).toBeUndefined();
    expect(findRequestForReply("")).toBeUndefined();
  });
});

describe("withRequestLog", () => {
  const fake = (reply: () => Promise<string>): ChatProviderAdapter => ({
    id: "fake",
    capabilities: { supportsImageGen: false, requiresApiKey: false, requiresBaseUrl: false },
    generateChat: async () => ({ text: await reply(), usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 } }),
    generateOnce: async () => ({ text: await reply() }),
  });

  it("records chat calls with everything that was sent", async () => {
    const adapter = withRequestLog(fake(async () => "Hey."));
    await adapter.generateChat(
      {
        model: "m1",
        systemInstruction: "System",
        temperature: 0.4,
        samplers: { topP: 0.9 },
        history: [{ role: "assistant", text: "Greeting" }],
        prompt: "Hello",
      },
      {}
    );
    expect(getRequestLog()[0]).toMatchObject({
      kind: "chat",
      provider: "fake",
      model: "m1",
      systemInstruction: "System",
      temperature: 0.4,
      samplers: { topP: 0.9 },
      history: [{ role: "assistant", text: "Greeting" }],
      prompt: "Hello",
      status: "done",
      response: "Hey.",
      usage: { totalTokens: 6 },
    });
  });

  it("records one-shot calls and failures, and still throws", async () => {
    const adapter = withRequestLog(fake(async () => { throw new Error("boom"); }));
    await expect(adapter.generateOnce("Summarize", "m2", {}, "Sys")).rejects.toThrow("boom");
    expect(getRequestLog()[0]).toMatchObject({ kind: "once", model: "m2", prompt: "Summarize", systemInstruction: "Sys", status: "error", error: "boom" });
  });
});

describe("inspector helpers", () => {
  it("splits the system instruction into its blank-line separated sections", () => {
    expect(splitSystemSections("You are Kai.\n\nPersonality: calm\n\n\nScenario: a bar")).toEqual(["You are Kai.", "Personality: calm", "Scenario: a bar"]);
    expect(splitSystemSections(undefined)).toEqual([]);
  });

  it("separates the post-history note from the final prompt", () => {
    const note = "[Out-of-character instructions from the user - follow them, but do not reply to or mention them:\nAuthor's note for the current scene: rain]";
    expect(splitPostHistoryNote(`Hello there\n\n${note}`)).toEqual({ prompt: "Hello there", postHistoryNote: note });
    expect(splitPostHistoryNote("Hello there")).toEqual({ prompt: "Hello there" });
  });

  it("formats a request as readable plain text", () => {
    const id = startRequest({ ...base, systemInstruction: "Be Kai.", temperature: 0.5, samplers: { topK: 40 }, history: [{ role: "assistant", text: "Hi!" }] }, 0);
    completeRequest(id, "Hey.", { inputTokens: 3, outputTokens: 1, totalTokens: 4 });
    const text = formatRequestForCopy(getRequest(id)!);
    expect(text).toContain("provider: ollama, model: llama3, temperature: 0.5, topK: 40");
    expect(text).toContain("## System\nBe Kai.");
    expect(text).toContain("## History\n[Assistant]\nHi!");
    expect(text).toContain("## Prompt\nHi");
    expect(text).toContain("## Reply\nHey.");
    expect(text).toContain("Usage: 3 in, 1 out, 4 total");
  });
});
