import { AWAY_MIN_MS, catchUpTime, LS_LAST_SEEN, resetAwaySession, wasAway } from "./away";

afterEach(() => {
  localStorage.clear();
  resetAwaySession();
});

describe("while you were away (#130)", () => {
  it("gives each job one moment inside a long enough absence", () => {
    const now = Date.now();
    localStorage.setItem(LS_LAST_SEEN, String(now - 5 * 60 * 60 * 1000));
    expect(wasAway()).toBe(true);
    const at = catchUpTime("status", () => 0.5)!;
    expect(at).toBeGreaterThan(now - 5 * 60 * 60 * 1000);
    expect(at).toBeLessThan(now);
    expect(catchUpTime("status")).toBeUndefined();
    expect(catchUpTime("channel")).toBeDefined();
  });

  it("does nothing after a short break or on a first visit", () => {
    expect(wasAway()).toBe(false);
    resetAwaySession();
    localStorage.setItem(LS_LAST_SEEN, String(Date.now() - AWAY_MIN_MS / 2));
    expect(catchUpTime("status")).toBeUndefined();
  });
});
