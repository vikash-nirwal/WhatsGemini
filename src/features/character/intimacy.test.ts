import { buildIntimacySection, buildKnowsSection, factsAboutUser, intimacyInScope } from "./intimacy";

const NOW = Date.UTC(2026, 9, 22, 12);
const msg = (txt: string) => ({ role: "you", txt });

describe("intimacy profile (#73)", () => {
  it("goes in only when the scene turns romantic", () => {
    expect(intimacyInScope("strangers", [msg("kiss me")])).toBe(false);
    expect(intimacyInScope("flirting", [])).toBe(true);
    expect(intimacyInScope(undefined, [msg("How was work?")])).toBe(false);
    expect(intimacyInScope(undefined, [msg("Can I hold hands with you?")])).toBe(true);
  });

  it("lists the filled fields for the character and the persona", () => {
    const text = buildIntimacySection({ name: "Aria", intimacy: { loveLanguage: "quality time", jealousy: " " } }, { name: "Vik", intimacy: { dislikes: "being rushed" } });
    expect(text).toBe("Aria in romance (stay true to it):\n- Love language: quality time\nWhat Vik likes in romance (honor it, never push past it):\n- Dislikes and limits: being rushed");
    expect(buildIntimacySection({ name: "Aria" }, undefined)).toBeUndefined();
  });
});

describe("characters know about each other (#74)", () => {
  it("summarises each other relationship without transcripts", () => {
    const text = buildKnowsSection("Aria", "Vik", [{ name: "Kai", relationship: "Rival", lastAt: NOW - 86_400_000 * 2, recentCount: 0, facts: ["Vik fixed Kai's bike"] }], NOW)!;
    expect(text).toContain("Aria knows Vik is also close to others:\n- Kai (Rival): they last talked 2 days ago. You've picked up: Vik fixed Kai's bike.");
    expect(buildKnowsSection("Aria", "Vik", [], NOW)).toBeUndefined();
  });

  it("picks facts that aren't just story events", () => {
    expect(factsAboutUser(["a", "b", "c", "d"], { b: "story" })).toEqual(["a", "c", "d"]);
  });
});
