import { addGrowth, arcCheckDue, buildArcPrompt, buildGrowthSection, parseArcReply, ARC_INTERVAL, MAX_GROWTH } from "./characterArc";

describe("character arc suggestions", () => {
  it("checks every ARC_INTERVAL messages", () => {
    expect(arcCheckDue(ARC_INTERVAL - 1, undefined)).toBe(false);
    expect(arcCheckDue(ARC_INTERVAL, undefined)).toBe(true);
    expect(arcCheckDue(ARC_INTERVAL + 10, ARC_INTERVAL)).toBe(false);
  });

  it("reads one sentence, or nothing when they haven't changed", () => {
    expect(parseArcReply('Change: "more open about her past since the lake."', [])).toBe("More open about her past since the lake.");
    expect(parseArcReply("SAME", [])).toBeUndefined();
    expect(parseArcReply("More confident.", ["more confident."])).toBeUndefined();
  });

  it("keeps a few notes and puts them in the prompt", () => {
    expect(addGrowth(Array.from({ length: MAX_GROWTH }, (_, i) => `n${i}`), "new")).toHaveLength(MAX_GROWTH);
    expect(buildGrowthSection("Aria", ["Braver now."])).toBe("How Aria has changed over the story so far (let it show naturally; it builds on the personality above):\n- Braver now.");
    expect(buildGrowthSection("Aria", [])).toBeUndefined();
    expect(buildArcPrompt("Aria", "Vik", "Shy.", ["Braver now."], [], "Vik: hi")).toContain("don't repeat these):\n- Braver now.");
  });
});
