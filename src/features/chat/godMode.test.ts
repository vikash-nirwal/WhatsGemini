import { addTruth, buildGodTruthsSection, removeTruth } from "./godMode";

describe("god mode (#160)", () => {
  it("keeps truths without repeats, and removes them", () => {
    let t = addTruth(undefined, "  Aria and Kai are married ");
    t = addTruth(t, "aria and kai are married");
    t = addTruth(t, "It always rains on Sundays");
    expect(t).toEqual(["aria and kai are married", "It always rains on Sundays"]);
    expect(removeTruth(t, "It always rains on Sundays")).toEqual(["aria and kai are married"]);
    expect(removeTruth(["x"], "x")).toBeUndefined();
  });

  it("tells every reply to accept them without question", () => {
    expect(buildGodTruthsSection([])).toBeUndefined();
    const s = buildGodTruthsSection(["Aria and Kai are married"])!;
    expect(s).toContain("never question, doubt, argue with or comment on them");
    expect(s).toContain("- Aria and Kai are married");
    // It changes facts, not who anyone is (2026-10-28).
    expect(s).toContain("A truth changes only what it says");
    expect(s).toContain("Never narrate, announce or act out a truth");
  });
});
