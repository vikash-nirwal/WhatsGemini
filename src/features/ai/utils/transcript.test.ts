import { formatTranscript, splitTrailingUserMessages, countSeedMessages, countProtectedPrefix, truncateHistory, latestSummaryIndex, trimToLatestSummary } from "./transcript";
import { Message } from "../../../types";
import { ChatMessage } from "../types";
import { AI, YOU } from "../../../utils/constants";

describe("splitTrailingUserMessages", () => {
  it("returns trailing user turns (oldest first) instead of dropping them", () => {
    const { history, trailingText } = splitTrailingUserMessages([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
      { role: "user", text: "first" },
      { role: "user", text: "second" },
    ]);
    expect(history).toEqual([{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }]);
    expect(trailingText).toBe("first\n\nsecond");
  });

  it("does not mutate its input", () => {
    const input = [{ role: "user" as const, text: "x" }];
    splitTrailingUserMessages(input);
    expect(input).toHaveLength(1);
  });
});

describe("formatTranscript", () => {
  it("labels lines with real names and skips hidden priming messages", () => {
    const text = formatTranscript(
      [
        { role: YOU, txt: "hi" },
        { role: AI, txt: "ignored", isSystem: true },
        { role: AI, txt: "hello", speakerId: 2 },
        { role: AI, txt: "hey" },
      ],
      { userName: "Arin", charName: "Mira", speakerNames: { 2: "Beck" } }
    );
    expect(text).toBe("Arin: hi\n\nBeck: hello\n\nMira: hey");
  });
});

describe("formatTranscript refusals", () => {
  it("skips flagged refusals", () => {
    expect(formatTranscript([{ role: AI, txt: "I can't help with that.", isRefusal: true }, { role: YOU, txt: "ok" }])).toBe("User: ok");
  });
});

describe("countSeedMessages", () => {
  it("counts only the chat's own leading hidden seed messages", () => {
    const seeded: Message[] = [
      { role: YOU, txt: "seed q", isSystem: true },
      { role: AI, txt: "seed a", isSystem: true },
      { role: YOU, txt: "hi" },
    ];
    expect(countSeedMessages(seeded)).toBe(2);
  });

  it("is zero for a chat that opened with a character greeting", () => {
    expect(countSeedMessages([{ role: AI, txt: "Hello there!" }, { role: YOU, txt: "hi" }])).toBe(0);
  });

  it("stops at a compression summary", () => {
    const messages: Message[] = [
      { role: YOU, txt: "summary", isCompressionSummary: true },
      { role: AI, txt: "ok", isSystem: true },
    ];
    expect(countSeedMessages(messages)).toBe(0);
  });
});

describe("countProtectedPrefix", () => {
  it("covers the seed plus the compression summary and its acknowledgement", () => {
    const messages: Message[] = [
      { role: YOU, txt: "seed q", isSystem: true },
      { role: AI, txt: "seed a", isSystem: true },
      { role: YOU, txt: "summary", isCompressionSummary: true },
      { role: AI, txt: "ok", isSystem: true },
      { role: YOU, txt: "hi" },
    ];
    expect(countProtectedPrefix(messages)).toBe(4);
  });

  it("covers a summary at the very start of a greeting-seeded chat", () => {
    const messages: Message[] = [
      { role: YOU, txt: "summary", isCompressionSummary: true },
      { role: AI, txt: "ok", isSystem: true },
      { role: YOU, txt: "hi" },
    ];
    expect(countProtectedPrefix(messages)).toBe(2);
  });

  it("is zero when there is nothing to protect", () => {
    expect(countProtectedPrefix([{ role: AI, txt: "Hello!" }, { role: YOU, txt: "hi" }])).toBe(0);
  });
});

describe("truncateHistory", () => {
  // Each message is 40 chars = 10 estimated tokens + 4 overhead = 14.
  const msg = (role: "user" | "assistant", label: string): ChatMessage => ({ role, text: label.padEnd(40, ".") });
  const history = () => [
    msg("user", "summary"),
    msg("assistant", "ack"),
    msg("user", "old 1"),
    msg("assistant", "old 2"),
    msg("user", "new 1"),
    msg("assistant", "new 2"),
  ];
  const labels = (h: ChatMessage[]) => h.map((m) => m.text.replace(/\.+$/, ""));

  it("keeps the protected prefix and the newest messages that fit", () => {
    expect(labels(truncateHistory(history(), 30, 2))).toEqual(["summary", "ack", "new 1", "new 2"]);
  });

  it("keeps only the first message when nothing is protected", () => {
    expect(labels(truncateHistory(history(), 30, 0))).toEqual(["summary", "new 1", "new 2"]);
  });

  it("leaves history alone with no token cap", () => {
    expect(truncateHistory(history(), 0, 2)).toHaveLength(6);
  });
});

describe("trimToLatestSummary", () => {
  const seed: Message[] = [
    { role: YOU, txt: "seed q", isSystem: true },
    { role: AI, txt: "seed a", isSystem: true },
  ];
  const summary = (txt: string): Message[] => [
    { role: YOU, txt, isCompressionSummary: true },
    { role: AI, txt: "ok", isSystem: true },
  ];
  const texts = (m: Message[]) => m.map((x) => x.txt);

  it("returns the messages unchanged when nothing was compressed", () => {
    const messages: Message[] = [...seed, { role: YOU, txt: "hi" }];
    expect(trimToLatestSummary(messages)).toBe(messages);
    expect(latestSummaryIndex(messages)).toBe(-1);
  });

  it("keeps the seed and everything from the latest summary on", () => {
    const messages: Message[] = [
      ...seed,
      { role: YOU, txt: "old 1" },
      ...summary("first summary"),
      { role: YOU, txt: "old 2" },
      ...summary("second summary"),
      { role: YOU, txt: "new" },
    ];
    expect(latestSummaryIndex(messages)).toBe(6);
    expect(texts(trimToLatestSummary(messages))).toEqual(["seed q", "seed a", "second summary", "ok", "new"]);
  });

  it("works for a greeting-seeded chat with no hidden seed", () => {
    const messages: Message[] = [{ role: AI, txt: "Hello!" }, { role: YOU, txt: "old" }, ...summary("s"), { role: YOU, txt: "new" }];
    expect(texts(trimToLatestSummary(messages))).toEqual(["s", "ok", "new"]);
  });
});
