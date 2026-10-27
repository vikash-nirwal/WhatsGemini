import { addToReplyLog, clearReplyLog, exportReplyLog, INSTRUCTION_MAX, loadReplyLog, readReplyExport, recordReply, REPLY_LOG_KEY, ReplyLogEntry, setReplyLogOn } from "./replyLog";

const mockStore = new Map<string, unknown>();
// Plain functions, not jest.fn: CRA resets mock implementations before each test.
jest.mock("../../services/dbService", () => ({
  dbService: {
    getSetting: async (key: string) => mockStore.get(key),
    setSetting: async (key: string, value: unknown) => void mockStore.set(key, value),
  },
}));

const entry = (kind: string, at: number): ReplyLogEntry => ({ at, kind, instruction: "", reply: `reply ${at}` });

beforeEach(() => {
  mockStore.clear();
  localStorage.clear();
});

describe("addToReplyLog", () => {
  it("keeps the newest of each kind and leaves the others alone", () => {
    let log: ReplyLogEntry[] = [entry("goal", 0)];
    for (let i = 1; i <= 4; i++) log = addToReplyLog(log, entry("world-talk", i), 3);
    expect(log.map((e) => `${e.kind}${e.at}`)).toEqual(["goal0", "world-talk2", "world-talk3", "world-talk4"]);
  });
});

describe("recordReply", () => {
  it("does nothing while the switch is off", async () => {
    await recordReply({ instruction: "What does Kai want this week? Reply with one sentence.", reply: "x" });
    expect(mockStore.has(REPLY_LOG_KEY)).toBe(false);
  });

  it("names the prompt: given kind, then its fingerprint, then the activity kind", async () => {
    setReplyLogOn(true);
    await Promise.all([
      recordReply({ instruction: "anything", reply: "a", kind: "goal", fallbackKind: "other" }, 1),
      recordReply({ instruction: "What does Kai want this week? One sentence.", reply: "b", fallbackKind: "other", model: "m" }, 2),
      recordReply({ instruction: "Write a status", reply: "c", fallbackKind: "status" }, 3),
      recordReply({ instruction: "Expand this idea", reply: "d" }, 4),
    ]);
    const log = await loadReplyLog();
    // All three land, though they were written at once.
    expect(log.map((e) => [e.kind, e.reply])).toEqual([["goal", "a"], ["goal", "b"], ["status", "c"]]);
    expect(log[1].model).toBe("m");
  });

  it("shortens long prompts", async () => {
    setReplyLogOn(true);
    await recordReply({ instruction: "x".repeat(INSTRUCTION_MAX + 50), reply: "a", kind: "goal" });
    expect((await loadReplyLog())[0].instruction).toHaveLength(INSTRUCTION_MAX);
  });

  it("clears", async () => {
    setReplyLogOn(true);
    await recordReply({ instruction: "", reply: "a", kind: "goal" });
    await clearReplyLog();
    expect(await loadReplyLog()).toEqual([]);
  });
});

describe("export", () => {
  it("round-trips, and reads a bare array too", () => {
    const log = [entry("goal", 1)];
    expect(readReplyExport(exportReplyLog(log, 0))).toEqual(log);
    expect(readReplyExport(JSON.stringify([{ kind: "goal", reply: "r", at: 1 }, { nope: true }]))).toEqual([{ kind: "goal", reply: "r", at: 1, instruction: "" }]);
  });
});
