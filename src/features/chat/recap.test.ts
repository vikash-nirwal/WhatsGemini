import { buildRecapPrompt, cleanRecap, decideRecap, latestStorySummary, recentForRecap } from "./recap";
import { Message } from "../../types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 20);

const chat = (count: number, lastAt: number): Message[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? "ai" : "you",
    txt: `message ${i}`,
    timestamp: lastAt - (count - 1 - i) * 60_000,
  }));

describe("decideRecap", () => {
  it("asks for a recap after the gap", () => {
    expect(decideRecap(chat(6, NOW - 4 * DAY), undefined, NOW, 3)).toEqual({ kind: "generate", forMessageId: "m5" });
  });

  it("shows nothing for a recent chat, a short one, or when switched off", () => {
    expect(decideRecap(chat(6, NOW - DAY), undefined, NOW, 3).kind).toBe("none");
    expect(decideRecap(chat(3, NOW - 9 * DAY), undefined, NOW, 3).kind).toBe("none");
    expect(decideRecap(chat(6, NOW - 9 * DAY), undefined, NOW, 0).kind).toBe("none");
  });

  it("reuses a recap written for the same last message, unless it was dismissed", () => {
    const recap = { text: "You met.", forMessageId: "m5", createdAt: NOW };
    expect(decideRecap(chat(6, NOW - 4 * DAY), recap, NOW, 3)).toEqual({ kind: "cached", recap });
    expect(decideRecap(chat(6, NOW - 4 * DAY), { ...recap, dismissed: true }, NOW, 3).kind).toBe("none");
    // New messages since, then another long gap: a fresh one.
    expect(decideRecap(chat(8, NOW - 5 * DAY), recap, NOW, 3)).toEqual({ kind: "generate", forMessageId: "m7" });
  });

  it("ignores hidden system messages when finding the last one", () => {
    const messages = [...chat(6, NOW - 4 * DAY), { id: "sys", role: "ai", txt: "ok", isSystem: true, timestamp: NOW }];
    expect(decideRecap(messages, undefined, NOW, 3)).toEqual({ kind: "generate", forMessageId: "m5" });
  });
});

describe("summary and recent messages", () => {
  const messages: Message[] = [
    { id: "a", role: "ai", txt: "old" },
    { id: "s", role: "you", txt: "Earlier conversation summary (treat as established context):\n\nThey met at the docks.", isCompressionSummary: true },
    { id: "ack", role: "ai", txt: "Understood", isSystem: true },
    { id: "b", role: "you", txt: "new" },
  ];

  it("takes the newest summary, preferring a chapter recap", () => {
    expect(latestStorySummary(messages)).toBe("They met at the docks.");
    expect(latestStorySummary([{ ...messages[1], chapterRecap: "Chapter one: the docks." }])).toBe("Chapter one: the docks.");
    expect(latestStorySummary([messages[0]])).toBeUndefined();
  });

  it("keeps only what came after it", () => {
    expect(recentForRecap(messages).map((m) => m.id)).toEqual(["b"]);
  });
});

describe("prompt and reply", () => {
  it("includes the summary only when there is one", () => {
    expect(buildRecapPrompt("Aria: hi", "They met.", "Aria", "Vik")).toContain("The story so far:\nThey met.");
    expect(buildRecapPrompt("Aria: hi", undefined, "Aria", "Vik")).not.toContain("The story so far");
  });

  it("strips a heading and quotes", () => {
    expect(cleanRecap('"Previously on Aria: You found the map."')).toBe("You found the map.");
  });
});
