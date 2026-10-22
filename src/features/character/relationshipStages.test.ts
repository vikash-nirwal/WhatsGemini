import { buildStagePrompt, buildStageSection, parseStageReply, stageCheckDue, STAGE_INTERVAL } from "./relationshipStages";

describe("relationship stages", () => {
  it("tells the character how forward to be at each stage", () => {
    expect(buildStageSection("strangers", "Vik")).toContain("Where things stand between you and Vik: Strangers. You've only just met.");
    expect(buildStageSection("dating", "Vik")).toContain("You're dating");
  });

  it("checks every STAGE_INTERVAL messages and reads one step up or down", () => {
    expect(stageCheckDue(STAGE_INTERVAL, undefined)).toBe(true);
    expect(stageCheckDue(STAGE_INTERVAL + 5, STAGE_INTERVAL)).toBe(false);
    expect(parseStageReply("NEXT", "flirting")).toBe("dating");
    expect(parseStageReply("back.", "flirting")).toBe("strangers");
    expect(parseStageReply("SAME", "flirting")).toBeUndefined();
    expect(parseStageReply("NEXT", "committed")).toBeUndefined();
  });

  it("offers only the moves that exist", () => {
    expect(buildStagePrompt("Aria", "Vik", "strangers", "Vik: hi")).toContain("Reply with only one word: NEXT, SAME.");
    expect(buildStagePrompt("Aria", "Vik", "committed", "Vik: hi")).toContain("Reply with only one word: BACK, SAME.");
  });
});
