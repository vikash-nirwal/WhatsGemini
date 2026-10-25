import { buildStoryTimeSection, DAY_MS, formatStoryDate, newStoryTime, parseMonths, setStoryDate, skipStoryTime, storyDaysBetween, storyParts } from "./storyTime";

const T0 = new Date(2026, 9, 21, 19, 0, 0).getTime();
const harvest = { ...newStoryTime(T0), year: 312, months: ["Thaw", "Sowing", "Harvest month", "Frost"], daysPerMonth: 10, day: 23 };

describe("story time (#147)", () => {
  it("reads the date from the calendar, moving a day per real day", () => {
    expect(storyParts(harvest, T0)).toEqual({ year: 312, month: "Harvest month", monthIndex: 2, day: 4 });
    expect(formatStoryDate(harvest, T0)).toBe("Year 312, Harvest month, day 4");
    expect(formatStoryDate(harvest, T0, true)).toBe("Year 312, Harvest month, day 4, evening");
    expect(formatStoryDate(harvest, T0 + 20 * DAY_MS)).toBe("Year 313, Thaw, day 4");
    expect(storyDaysBetween(harvest, T0, T0 + 3 * DAY_MS)).toBe(3);
  });

  it("a paused calendar only moves by skips, and has no time of day", () => {
    const paused = { ...harvest, moves: false };
    expect(formatStoryDate(paused, T0 + 5 * DAY_MS, true)).toBe("Year 312, Harvest month, day 4");
    const skipped = skipStoryTime(paused, 7, T0 + 5 * DAY_MS);
    expect(formatStoryDate(skipped, T0 + 9 * DAY_MS)).toBe("Year 312, Frost, day 1");
    expect(storyDaysBetween(paused, T0, T0 + 9 * DAY_MS)).toBe(0);
  });

  it("sets a date by hand, clamped to the calendar", () => {
    expect(formatStoryDate(setStoryDate(harvest, { year: 400, monthIndex: 9, day: 99 }, T0), T0)).toBe("Year 400, Frost, day 10");
  });

  it("stands in for the real clock in the prompt", () => {
    const section = buildStoryTimeSection(harvest, "Harbour Town", T0, 2 * DAY_MS);
    expect(section).toContain("In-world date in Harbour Town: Year 312, Harvest month, day 4, evening.");
    expect(section).toContain("About 2 days passed in the story");
    expect(section).toContain("never the real one");
    expect(parseMonths(" Thaw, ,Sowing ")).toEqual(["Thaw", "Sowing"]);
  });
});
