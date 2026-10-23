import { buildWritingStyleSection, cleanWritingStyle, writingStyleLine } from "./writingStyle";

describe("how they write (#111)", () => {
  it("keeps only what's set and drops an empty profile", () => {
    expect(cleanWritingStyle(undefined)).toBeUndefined();
    expect(cleanWritingStyle({})).toBeUndefined();
    expect(cleanWritingStyle({ lowercase: false, abbreviations: false })).toBeUndefined();
    expect(cleanWritingStyle({ length: "short", lowercase: true, punctuation: "sparse", emoji: "rare", abbreviations: true, doubleTexts: true })).toEqual({
      length: "short", lowercase: true, punctuation: "sparse", emoji: "rare", abbreviations: true, doubleTexts: true,
    });
  });

  it("writes the section from the traits set, and nothing from none", () => {
    expect(buildWritingStyleSection("Aria", undefined)).toBeUndefined();
    expect(buildWritingStyleSection("Aria", {})).toBeUndefined();
    const section = buildWritingStyleSection("Aria", { length: "short", lowercase: true, emoji: "none", doubleTexts: true })!;
    expect(section).toBe("How Aria writes: keeps messages short, a line or two; writes mostly in lowercase; never uses emoji; often sends a thought as two or three texts in a row rather than one. Keep to this in every reply, whatever the mood.");
    expect(buildWritingStyleSection("Aria", { punctuation: "careful", emoji: "often", abbreviations: true })).toContain("punctuates carefully, in full sentences; uses emoji often; uses abbreviations (u, rn, tbh, idk)");
    expect(writingStyleLine({ length: "long" })).toBe("writes long, expressive messages");
    expect(writingStyleLine(undefined)).toBeUndefined();
  });
});
