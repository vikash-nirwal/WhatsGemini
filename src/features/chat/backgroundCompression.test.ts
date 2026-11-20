import { claimCompression, isCompressing, latestSummaryId, resetCompressions, runBackgroundCompression, STALE_AFTER_MS, summaryStillFits, SummaryResult, watchCompressions } from "./backgroundCompression";
import { spliceSummaryIntoConversation, migrateToTree, removeSummaryFromConversation } from "./messageTree";
import { buildSummaryMessages } from "../ai/utils/transcript";
import { YOU, AI } from "../../utils/constants";
import { Message } from "../../types";

const msg = (i: number): Message => ({ id: `m${i}`, role: i % 2 === 0 ? YOU : AI, txt: `message ${i}`, timestamp: 1000 + i });
const chat = (count: number): Message[] => Array.from({ length: count }, (_, i) => msg(i));

// A summary of messages 0..afterIndex, as the summary call would hand back.
const summaryOf = (afterIndex: number): SummaryResult => ({
  compressed: true,
  summaryMessages: buildSummaryMessages(`up to ${afterIndex}`, 1000 + afterIndex).map((m, i) => ({ ...m, id: `s${afterIndex}_${i}` })),
  afterIndex,
});

// A saved chat the fake deps read and write, spliced the same way
// insertCompressionSummary does it.
const savedChat = (content: Message[]) => {
  const store = { ...migrateToTree(content) };
  return {
    store,
    read: async () => store.content,
    insert: async ({ afterMessageId, afterIndex, summaryMessages, expect }: any) => {
      if (!summaryStillFits(store.content, expect)) return false;
      const spliced = spliceSummaryIntoConversation(store, afterMessageId, afterIndex, summaryMessages)!;
      Object.assign(store, spliced);
      return true;
    },
    send: (m: Message) => {
      const id = m.id!;
      const leaf = store.activeLeafId!;
      store.tree = { nodes: { ...store.tree.nodes, [leaf]: { ...store.tree.nodes[leaf], childIds: [...store.tree.nodes[leaf].childIds, id] }, [id]: { id, message: m, parentId: leaf, childIds: [] } } };
      store.activeLeafId = id;
      store.content = [...store.content, m];
    },
  };
};

afterEach(() => resetCompressions());

describe("claimCompression", () => {
  it("lets only one run hold a chat at a time, and other chats are free", () => {
    const release = claimCompression(1, 0)!;
    expect(release).toBeTruthy();
    expect(claimCompression(1, 10)).toBeNull();
    expect(claimCompression(2, 10)).toBeTruthy();
    expect(isCompressing(1, 10)).toBe(true);
    release();
    expect(isCompressing(1, 10)).toBe(false);
    expect(claimCompression(1, 20)).toBeTruthy();
  });

  it("stops counting a run that never came back, so the chat can be summarised again", () => {
    const stuck = claimCompression(1, 0)!;
    expect(isCompressing(1, STALE_AFTER_MS - 1)).toBe(true);
    expect(isCompressing(1, STALE_AFTER_MS)).toBe(false);
    const fresh = claimCompression(1, STALE_AFTER_MS)!;
    // The old run finishing late doesn't end the new one's claim.
    stuck();
    expect(isCompressing(1, STALE_AFTER_MS + 1)).toBe(true);
    fresh();
    expect(isCompressing(1, STALE_AFTER_MS + 1)).toBe(false);
  });

  it("tells watchers when a run starts and ends", () => {
    const seen: boolean[] = [];
    const stop = watchCompressions(() => seen.push(isCompressing(3)));
    claimCompression(3)!();
    stop();
    expect(seen).toEqual([true, false]);
  });
});

describe("summaryStillFits", () => {
  it("fits when only new messages came after the last one it covers", () => {
    const before = chat(10);
    const now = [...before, msg(10), msg(11)];
    expect(summaryStillFits(now, { latestSummaryId: null, anchor: before[5], afterIndex: 5 })).toBe(true);
  });

  it("doesn't fit once another summary went in, or the one it built on was undone", () => {
    const before = chat(10);
    const withSummary = [...before.slice(0, 4), ...summaryOf(3).summaryMessages!, ...before.slice(4)];
    expect(summaryStillFits(withSummary, { latestSummaryId: null, anchor: before[5], afterIndex: 5 })).toBe(false);
    expect(latestSummaryId(withSummary)).toBe("s3_0");
    expect(summaryStillFits(before, { latestSummaryId: "s3_0", anchor: before[5], afterIndex: 5 })).toBe(false);
  });

  it("doesn't fit when the message it ends on is no longer on the active path", () => {
    const before = chat(10);
    expect(summaryStillFits(before.slice(0, 4), { latestSummaryId: null, anchor: before[5], afterIndex: 5 })).toBe(false);
    expect(summaryStillFits(before, { latestSummaryId: null, anchor: undefined, afterIndex: 5 })).toBe(false);
  });

  it("matches an old chat's messages without ids by place, time and text", () => {
    const before = chat(10).map(({ id, ...m }) => m);
    expect(summaryStillFits(before, { latestSummaryId: null, anchor: before[5], afterIndex: 5 })).toBe(true);
    const edited = before.map((m, i) => (i === 5 ? { ...m, txt: "changed" } : m));
    expect(summaryStillFits(edited, { latestSummaryId: null, anchor: before[5], afterIndex: 5 })).toBe(false);
  });
});

describe("runBackgroundCompression", () => {
  it("keeps messages sent while the summary was written, after the summary", async () => {
    const saved = savedChat(chat(10));
    let finishSummary!: () => void;
    const run = runBackgroundCompression(1, {
      read: saved.read,
      summarise: () => new Promise<SummaryResult>((resolve) => (finishSummary = () => resolve(summaryOf(5)))),
      insert: saved.insert,
    });
    await Promise.resolve();
    expect(isCompressing(1)).toBe(true);
    // Sent (and answered) while the summary call is out.
    saved.send(msg(10));
    saved.send(msg(11));
    finishSummary();
    expect((await run).status).toBe("done");

    const texts = saved.store.content.map((m) => (m.isCompressionSummary ? "SUMMARY" : m.txt));
    expect(texts.indexOf("SUMMARY")).toBe(6);
    expect(texts.slice(-2)).toEqual(["message 10", "message 11"]);
    expect(saved.store.content).toHaveLength(14);
    expect(saved.store.activeLeafId).toBe("m11");
    expect(isCompressing(1)).toBe(false);
  });

  it("does nothing while another run holds the same chat", async () => {
    const saved = savedChat(chat(10));
    const summarise = jest.fn(async () => summaryOf(5));
    const release = claimCompression(1)!;
    expect((await runBackgroundCompression(1, { read: saved.read, summarise, insert: saved.insert })).status).toBe("busy");
    expect(summarise).not.toHaveBeenCalled();
    release();
  });

  it("two started together make one summary", async () => {
    const saved = savedChat(chat(10));
    const summarise = jest.fn(async () => summaryOf(5));
    const outcomes = await Promise.all([1, 2].map(() => runBackgroundCompression(1, { read: saved.read, summarise, insert: saved.insert })));
    expect(outcomes.map((o) => o.status).sort()).toEqual(["busy", "done"]);
    expect(summarise).toHaveBeenCalledTimes(1);
    expect(saved.store.content.filter((m) => m.isCompressionSummary)).toHaveLength(1);
  });

  it("drops its summary when the chat was summarised or changed meanwhile", async () => {
    const saved = savedChat(chat(10));
    let finishSummary!: () => void;
    const run = runBackgroundCompression(1, {
      read: saved.read,
      summarise: () => new Promise<SummaryResult>((resolve) => (finishSummary = () => resolve(summaryOf(5)))),
      insert: saved.insert,
    });
    await Promise.resolve();
    // The manual "Compress" went in first.
    Object.assign(saved.store, spliceSummaryIntoConversation(saved.store, "m3", 3, summaryOf(3).summaryMessages!)!);
    finishSummary();
    expect((await run).status).toBe("stale");
    expect(saved.store.content.filter((m) => m.isCompressionSummary).map((m) => m.id)).toEqual(["s3_0"]);
  });

  it("drops its summary when the summary it built on was undone meanwhile", async () => {
    const start = savedChat(chat(10));
    Object.assign(start.store, spliceSummaryIntoConversation(start.store, "m1", 1, summaryOf(1).summaryMessages!)!);
    let finishSummary!: () => void;
    const run = runBackgroundCompression(1, {
      read: start.read,
      summarise: () => new Promise<SummaryResult>((resolve) => (finishSummary = () => resolve(summaryOf(7)))),
      insert: start.insert,
    });
    await Promise.resolve();
    Object.assign(start.store, removeSummaryFromConversation(start.store, "s1_0")!);
    finishSummary();
    expect((await run).status).toBe("stale");
    expect(start.store.content.some((m) => m.isCompressionSummary)).toBe(false);
  });

  it("lets go of the chat when the summary call fails or throws", async () => {
    const saved = savedChat(chat(10));
    const failed = await runBackgroundCompression(1, { read: saved.read, summarise: async () => ({ compressed: false, error: "blocked" }), insert: saved.insert });
    expect(failed).toEqual({ status: "failed", error: "blocked" });
    expect(isCompressing(1)).toBe(false);

    const thrown = await runBackgroundCompression(1, { read: saved.read, summarise: async () => { throw new Error("network down"); }, insert: saved.insert });
    expect(thrown).toEqual({ status: "failed", error: "network down" });
    expect(isCompressing(1)).toBe(false);

    const readFails = await runBackgroundCompression(1, { read: async () => { throw new Error("db closed"); }, summarise: async () => summaryOf(5), insert: saved.insert });
    expect(readFails.status).toBe("failed");
    expect(isCompressing(1)).toBe(false);
  });

  it("is idle when the chat isn't long enough yet", async () => {
    const saved = savedChat(chat(4));
    expect((await runBackgroundCompression(1, { read: saved.read, summarise: async () => ({ compressed: false }), insert: saved.insert })).status).toBe("idle");
    expect(saved.store.content).toHaveLength(4);
  });
});
