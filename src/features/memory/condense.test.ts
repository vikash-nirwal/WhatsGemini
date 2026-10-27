import { applyCondensed, buildCondensePrompt, CONDENSE_AT, condenseDue, parseCondensed } from "./condense";

describe("condensing old facts instead of dropping them (#232)", () => {
  const facts = Array.from({ length: CONDENSE_AT + 1 }, (_, i) => `fact ${i}`);

  it("is due once the list passes the threshold", () => {
    expect(condenseDue({ memory: facts })).toBe(true);
    expect(condenseDue({ memory: facts.slice(1) })).toBe(false);
  });

  it("asks for a few categorised lines from the oldest facts", () => {
    const prompt = buildCondensePrompt("Aria", "Sam", ["Sam likes jazz.", "Sam loves jazz clubs."], { "Sam likes jazz.": "user" });
    expect(prompt).toContain("- [user] Sam likes jazz.");
    expect(prompt).toContain("at most 8 short lines");
  });

  it("reads the lines back, and refuses a reply that saves nothing", () => {
    expect(parseCondensed("Here you go:\n- [user] Sam loves jazz, clubs most of all.\n2. [story] They met at the docks.\nnot a fact", 4)).toEqual({
      facts: ["Sam loves jazz, clubs most of all.", "They met at the docks."],
      categories: { "Sam loves jazz, clubs most of all.": "user", "They met at the docks.": "story" },
    });
    expect(parseCondensed("[user] a\n[user] b", 2)).toBeUndefined();
    expect(parseCondensed("nothing useful", 10)).toBeUndefined();
  });

  it("replaces the oldest facts, keeping the earliest date and the rest as they were", () => {
    const m = {
      memory: ["Sam likes jazz.", "Sam loves jazz clubs.", "Sam has a cat."],
      memoryDates: { "Sam likes jazz.": { learnedAt: 100 }, "Sam loves jazz clubs.": { learnedAt: 50 }, "Sam has a cat.": { learnedAt: 900 } },
      memoryCategories: { "Sam likes jazz.": "user" as const, "Sam has a cat.": "user" as const },
    };
    const next = applyCondensed(m, 2, { facts: ["Sam loves jazz, clubs most of all."], categories: { "Sam loves jazz, clubs most of all.": "user" } });
    expect(next.memory).toEqual(["Sam loves jazz, clubs most of all.", "Sam has a cat."]);
    expect(next.memoryDates).toEqual({ "Sam has a cat.": { learnedAt: 900 }, "Sam loves jazz, clubs most of all.": { learnedAt: 50 } });
    expect(next.memoryCategories).toEqual({ "Sam has a cat.": "user", "Sam loves jazz, clubs most of all.": "user" });
  });
});
