import { MemoryFactDates } from "../../../types";
import { NO_MEMORY_CHANGES } from "./memoryExtraction";
import { annotateFacts, buildCallbackDirective, buildMisrememberDirective, CALLBACK_GAP_MS, callbackDue, carryMemoryDates, formatLearned, memoryDatesFor, pickCallback } from "./memoryTime";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 21, 10, 0, 0).getTime();
const MARCH = new Date(2026, 2, 12, 9, 0, 0).getTime();
const LAST_YEAR = new Date(2025, 6, 4, 9, 0, 0).getTime();

describe("memory with time (#109)", () => {
  it("dates new facts, keeps a reworded fact's date and marks what came up again", () => {
    const existing = ["Sam likes jazz", "Sam has a cat"];
    const previous: Record<string, MemoryFactDates> = { "Sam likes jazz": { learnedAt: MARCH }, "Sam has a cat": { learnedAt: MARCH } };
    const changes = { ...NO_MEMORY_CHANGES, added: ["Sam moved to Leeds"], updated: [{ index: 1, text: "Sam has two cats" }], reinforced: [0] };
    const dates = carryMemoryDates(["Sam likes jazz", "Sam has two cats", "Sam moved to Leeds"], ["Pinned"], previous, existing, changes, NOW)!;
    expect(dates["Sam likes jazz"]).toEqual({ learnedAt: MARCH, mentionedAt: NOW });
    expect(dates["Sam has two cats"]).toEqual({ learnedAt: MARCH, mentionedAt: NOW });
    expect(dates["Sam moved to Leeds"]).toEqual({ learnedAt: NOW });
    expect(dates["Pinned"]).toEqual({ learnedAt: NOW });
    expect(dates["Sam has a cat"]).toBeUndefined();
    expect(memoryDatesFor([], undefined, new Map(), new Set(), NOW)).toBeUndefined();
  });

  it("shows when a fact was learned, except in the last two days", () => {
    expect(formatLearned(MARCH, NOW)).toBe("12 Mar");
    expect(formatLearned(LAST_YEAR, NOW)).toBe("4 Jul 2025");
    expect(formatLearned(NOW - DAY, NOW)).toBeUndefined();
    expect(annotateFacts(["a", "b", "c"], { a: { learnedAt: MARCH }, b: { learnedAt: NOW } }, NOW)).toEqual(["a (learned 12 Mar)", "b", "c"]);
    expect(annotateFacts(["a"], undefined, NOW)).toEqual(["a"]);
  });

  it("offers a callback every couple of days, from facts a week old that haven't come up", () => {
    expect(callbackDue(undefined, NOW)).toBe(true);
    expect(callbackDue({ callbackAt: NOW - DAY }, NOW)).toBe(false);
    expect(callbackDue({ callbackAt: NOW - CALLBACK_GAP_MS }, NOW)).toBe(true);
    const dates: Record<string, MemoryFactDates> = {
      old: { learnedAt: MARCH },
      recent: { learnedAt: NOW - 2 * DAY },
      revived: { learnedAt: MARCH, mentionedAt: NOW - DAY },
    };
    const facts = ["old", "recent", "revived", "undated"];
    expect(pickCallback(facts, dates, NOW, "chat-1-2026-10-21")).toEqual({ fact: "old", learnedAt: MARCH });
    expect(pickCallback(facts, dates, NOW, "another")).toEqual({ fact: "old", learnedAt: MARCH });
    expect(pickCallback(["recent", "undated"], dates, NOW, "x")).toBeUndefined();
    expect(pickCallback(facts, undefined, NOW, "x")).toBeUndefined();
    // Spread over the old facts, steady for one seed.
    const many = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}`, { learnedAt: MARCH }]));
    const picks = new Set(Array.from({ length: 30 }, (_, i) => pickCallback(Object.keys(many), many, NOW, `seed-${i}`)!.fact));
    expect(picks.size).toBeGreaterThan(3);
  });

  it("writes the directives", () => {
    const note = buildCallbackDirective("Aria", "Sam", "Sam was nervous about the interview", MARCH, NOW);
    expect(note).toContain('"Sam was nervous about the interview" (Aria learned it 7 months ago)');
    expect(buildCallbackDirective("Aria", "Sam", "x", NOW - 10 * DAY, NOW)).toContain("10 days ago");
    expect(buildCallbackDirective("Aria", "Sam", "x", NOW - 21 * DAY, NOW)).toContain("3 weeks ago");
    expect(buildMisrememberDirective("Aria")).toContain("corrects themselves");
  });
});
