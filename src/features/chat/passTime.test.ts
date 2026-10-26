import { buildTimePassedNote, buildTimePassedOpener, describeGap, gapDays, timePassedInScope, timePassedNotice } from "./passTime";

describe("pass the time", () => {
  it("names the gap and converts it to story days", () => {
    expect(describeGap(1, "days")).toBe("1 day");
    expect(describeGap(3, "years")).toBe("3 years");
    expect(gapDays(2, "weeks")).toBe(14);
    expect(gapDays(6, "hours")).toBe(0.25);
    expect(timePassedNotice({ gap: "3 years" })).toBe("⏳ 3 years later");
  });

  it("tells replies how long it's been, scaled to how it feels", () => {
    const years = buildTimePassedNote({ gap: "3 years", days: 1095, note: "she moved to Porto", at: 1, fromMessage: 10 }, "Sam");
    expect(years).toContain("3 years have passed in the story since you and Sam last talked. Meanwhile: she moved to Porto.");
    expect(years).toContain("you've changed");
    expect(buildTimePassedNote({ gap: "4 hours", days: 0.17, at: 1, fromMessage: 0 }, "Sam")).toContain("pick up where you left off");
    expect(buildTimePassedOpener({ gap: "2 months", days: 60, at: 1, fromMessage: 0 }, "Sam")).toContain("You reach out first now");
  });

  it("fades after a few exchanges", () => {
    const passed = { gap: "1 year", days: 365, at: 1, fromMessage: 10 };
    expect(timePassedInScope(passed, 12)).toBe(true);
    expect(timePassedInScope(passed, 17)).toBe(false);
    expect(timePassedInScope(undefined, 3)).toBe(false);
  });
});
