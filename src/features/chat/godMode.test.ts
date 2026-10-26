import { addTruth, buildGodDirective, buildGodTruthsSection, removeTruth } from "./godMode";

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
    expect(buildGodDirective("The bakery burned down")).toContain('"The bakery burned down"');
  });
});
