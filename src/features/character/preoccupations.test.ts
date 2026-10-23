import { Character, Preoccupation } from "../../types";
import { applyConcerns, buildConcernsPrompt, buildConcernsSection, CONCERNS_GAP_MS, concernsDue, concernsLine, dropConcern, parseConcerns } from "./preoccupations";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 21, 10, 0, 0).getTime();
const aria = (extra: Partial<Character> = {}) => ({ id: 1, name: "Aria", description: "Warm.", prompt: "You are Aria.", ...extra } as Character);
const open: Preoccupation[] = [
  { id: "a", text: "Aria's landlord wants to inspect the flat on Friday.", since: NOW - 5 * DAY },
  { id: "b", text: "Aria is trying to run three times a week.", since: NOW - 20 * DAY },
];

describe("their own preoccupations (#110)", () => {
  it("is due weekly with the switch on", () => {
    expect(concernsDue(aria(), NOW)).toBe(false);
    expect(concernsDue(aria({ preoccupations: true }), NOW)).toBe(true);
    expect(concernsDue(aria({ preoccupations: true, concernsWrittenAt: NOW - DAY }), NOW)).toBe(false);
    expect(concernsDue(aria({ preoccupations: true, concernsWrittenAt: NOW - CONCERNS_GAP_MS }), NOW)).toBe(true);
  });

  it("asks for new items and which current ones are over", () => {
    const prompt = buildConcernsPrompt(aria(), NOW, { routine: "Aria's routine: cafés.", dayLog: "Aria slept in.", facts: ["Sam likes jazz"], current: open });
    expect(prompt).toContain("1. Aria's landlord wants to inspect the flat on Friday. (since 5 days ago)");
    expect(prompt).toContain("2. Aria is trying to run three times a week. (since 3 weeks ago)");
    expect(prompt).toContain("DONE <number>");
    expect(prompt).toContain("Today: Aria slept in.");
    expect(buildConcernsPrompt(aria(), NOW, { facts: [], current: [] })).not.toContain("DONE");
  });

  it("parses the reply and applies it, keeping the lists short", () => {
    const update = parseConcerns("- NEW: Aria's sister is visiting next weekend.\nNEW: \"Aria wants to try pottery.\"\nDONE 1: the inspection went fine\nDONE 9: nonsense\nSomething else", 2);
    expect(update).toEqual({ added: ["Aria's sister is visiting next weekend.", "Aria wants to try pottery."], done: [{ index: 0, outcome: "the inspection went fine" }] });
    const next = applyConcerns(open, update, NOW);
    expect(next.map((c) => c.text)).toEqual([
      "Aria's landlord wants to inspect the flat on Friday.",
      "Aria is trying to run three times a week.",
      "Aria's sister is visiting next weekend.",
      "Aria wants to try pottery.",
    ]);
    expect(next[0]).toMatchObject({ resolvedAt: NOW, outcome: "the inspection went fine" });
    expect(next[2].since).toBe(NOW);
    // At most four open, the oldest dropped; at most four finished kept.
    const many = applyConcerns(next, { added: ["c", "d", "e"], done: [] }, NOW + DAY);
    expect(many.filter((c) => !c.resolvedAt)).toHaveLength(4);
    expect(many.filter((c) => !c.resolvedAt).map((c) => c.text)).toEqual(["Aria wants to try pottery.", "c", "d", "e"]);
    expect(dropConcern(next, "b").map((c) => c.id)).not.toContain("b");
  });

  it("writes the note, with what's recently over, and the one-liner", () => {
    const concerns = [...open, { id: "z", text: "Aria had a dentist appointment.", since: NOW - 10 * DAY, resolvedAt: NOW - 2 * DAY, outcome: "no fillings" }];
    const note = buildConcernsSection("Aria", concerns, NOW)!;
    expect(note).toContain("Things going on in Aria's own life right now");
    expect(note).toContain("- Aria's landlord wants to inspect the flat on Friday. (since 5 days ago)");
    expect(note).toContain("Recently over: Aria had a dentist appointment. - no fillings");
    expect(buildConcernsSection("Aria", [{ ...concerns[2], resolvedAt: NOW - 30 * DAY }], NOW)).toBeUndefined();
    expect(buildConcernsSection("Aria", undefined, NOW)).toBeUndefined();
    expect(concernsLine(concerns)).toBe("Aria's landlord wants to inspect the flat on Friday.; Aria is trying to run three times a week.");
    expect(concernsLine([])).toBeUndefined();
  });
});
