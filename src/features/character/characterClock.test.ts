import { characterClock, clockIn, zoneOf } from "./characterClock";

// Thursday 15 January 2026, 12:00 UTC.
const NOON_UTC = Date.UTC(2026, 0, 15, 12, 0);

describe("clockIn (#249)", () => {
  it("reads the hour, weekday and date in the given time zone", () => {
    expect(clockIn(NOON_UTC, "Europe/Lisbon")).toEqual({ hour: 12, weekday: 4, dayKey: "2026-01-15" });
    expect(clockIn(NOON_UTC, "Asia/Tokyo")).toEqual({ hour: 21, weekday: 4, dayKey: "2026-01-15" });
    expect(clockIn(NOON_UTC, "America/New_York")).toEqual({ hour: 7, weekday: 4, dayKey: "2026-01-15" });
  });

  it("keeps the minutes as a fraction of the hour", () => {
    expect(clockIn(NOON_UTC, "Asia/Kolkata").hour).toBe(17.5);
  });

  it("crosses midnight into their next or previous day", () => {
    const evening = Date.UTC(2026, 0, 15, 20, 0);
    expect(clockIn(evening, "Asia/Tokyo")).toEqual({ hour: 5, weekday: 5, dayKey: "2026-01-16" });
    const early = Date.UTC(2026, 0, 15, 3, 0);
    expect(clockIn(early, "America/Los_Angeles")).toEqual({ hour: 19, weekday: 3, dayKey: "2026-01-14" });
    expect(clockIn(Date.UTC(2026, 0, 15, 13, 0), "Australia/Sydney")).toEqual({ hour: 0, weekday: 5, dayKey: "2026-01-16" });
  });

  it("follows daylight saving", () => {
    expect(clockIn(Date.UTC(2026, 6, 15, 12, 0), "Europe/Lisbon").hour).toBe(13);
  });

  it("uses your local time without a zone, or with one it doesn't know", () => {
    const d = new Date(NOON_UTC);
    const local = d.getHours() + d.getMinutes() / 60;
    expect(clockIn(NOON_UTC).hour).toBe(local);
    expect(clockIn(NOON_UTC, "Mars/Olympus_Mons").hour).toBe(local);
    expect(clockIn(NOON_UTC, "Mars/Olympus_Mons").weekday).toBe(d.getDay());
  });
});

describe("characterClock", () => {
  it("runs on the character's home time zone when they have one", () => {
    expect(zoneOf({ home: { timeZone: "Asia/Tokyo" } })).toBe("Asia/Tokyo");
    expect(zoneOf({})).toBeUndefined();
    expect(characterClock({ home: { timeZone: "Asia/Tokyo" } }, NOON_UTC).hour).toBe(21);
    expect(characterClock(undefined, NOON_UTC)).toEqual(clockIn(NOON_UTC));
  });
});
