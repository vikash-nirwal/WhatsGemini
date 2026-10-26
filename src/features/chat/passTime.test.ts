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

describe("passing the time for a whole world", () => {
  const { buildWorldTimeTextPrompt, firstAfterGap } = require("./passTime");
  test("the people you talked to most recently text first, three at most", () => {
    const people = [1, 2, 3, 4, 5].map((id) => ({ id }));
    const chats = [
      { characterIds: [1], content: [{ timestamp: 10 }] },
      { characterIds: [2], content: [{ timestamp: 50 }] },
      { characterIds: [3], content: [{ timestamp: 30 }], archived: true },
      { characterIds: [4], content: [{ timestamp: 40 }] },
      { characterIds: [4, 5], content: [{ timestamp: 90 }] },
      { characterIds: [5], content: [] },
    ];
    expect(firstAfterGap(people, chats).map((c: { id: number }) => c.id)).toEqual([2, 4, 1]);
  });
  test("their text knows the gap, what happened and where you left off", () => {
    const prompt = buildWorldTimeTextPrompt({ name: "Aria", relationship: "friend" }, { gap: "3 years", days: 1095, note: "the harbour froze" }, "Sam", ["Sam: see you tomorrow"]);
    expect(prompt).toContain("Sam is your friend.");
    expect(prompt).toContain("Sam: see you tomorrow");
    expect(prompt).toContain("3 years have passed since your last conversation with Sam (meanwhile: the harbour froze)");
    expect(prompt).toContain("A very long time");
  });
});
