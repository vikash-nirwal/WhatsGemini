import { buildDatesSection, datesToCelebrate, daysUntil, isValidDate, mergeDates, parseDatesReply } from "./importantDates";
import { ImportantDate } from "../../types";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15, 0).getTime();
const date = (overrides: Partial<ImportantDate>): ImportantDate => ({ id: "x", label: "Your birthday", month: 3, day: 4, messageOnDay: true, ...overrides });

describe("daysUntil", () => {
  it("counts to the next occurrence, wrapping into next year", () => {
    expect(daysUntil(date({}), at(2026, 3, 4))).toBe(0);
    expect(daysUntil(date({}), at(2026, 3, 1))).toBe(3);
    expect(daysUntil(date({}), at(2026, 3, 5))).toBe(364);
  });

  it("moves Feb 29 to Feb 28 outside leap years", () => {
    expect(daysUntil(date({ month: 2, day: 29 }), at(2026, 2, 28))).toBe(0);
  });
});

describe("isValidDate", () => {
  it("rejects impossible dates", () => {
    expect(isValidDate({ month: 2, day: 30 })).toBe(false);
    expect(isValidDate({ month: 13, day: 1 })).toBe(false);
    expect(isValidDate({ month: 2, day: 29 })).toBe(true);
  });
});

describe("buildDatesSection", () => {
  it("lists every date and calls out today and the near ones", () => {
    const text = buildDatesSection([date({ year: 2000 }), date({ id: "y", label: "The day we met", month: 3, day: 6 })], at(2026, 3, 4))!;
    expect(text).toContain("- Your birthday: March 4, 2000 - that's TODAY (26 years)");
    expect(text).toContain("- The day we met: March 6 - in 2 days");
    expect(text).toContain("Today is your birthday.");
  });

  it("returns nothing without valid dates", () => {
    expect(buildDatesSection([date({ month: 2, day: 31 })], at(2026, 3, 4))).toBeUndefined();
  });
});

describe("datesToCelebrate", () => {
  it("picks today's dates that want a message, once a year", () => {
    expect(datesToCelebrate([date({})], at(2026, 3, 4))).toHaveLength(1);
    expect(datesToCelebrate([date({ lastCelebratedYear: 2026 })], at(2026, 3, 4))).toHaveLength(0);
    expect(datesToCelebrate([date({ messageOnDay: false })], at(2026, 3, 4))).toHaveLength(0);
    expect(datesToCelebrate([date({})], at(2026, 3, 5))).toHaveLength(0);
  });
});

describe("parseDatesReply and mergeDates", () => {
  it("reads valid dates and skips the rest", () => {
    const found = parseDatesReply('```json\n[{"label":"Your birthday","month":7,"day":12,"year":1998},{"label":"Bad","month":2,"day":31},{"label":"","month":1,"day":1}]\n```');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ label: "Your birthday", month: 7, day: 12, year: 1998, messageOnDay: true });
    expect(parseDatesReply("no dates here")).toEqual([]);
  });

  it("doesn't add a date twice", () => {
    const existing = [date({})];
    expect(mergeDates(existing, [date({ id: "new", label: "your birthday" }), date({ id: "z", label: "Anniversary", month: 9, day: 1 })])).toHaveLength(2);
  });
});
