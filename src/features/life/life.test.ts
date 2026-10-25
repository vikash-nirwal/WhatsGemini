import { lifeScaled, loadLifeDial, saveLifeDial } from "./lifeDial";
import { groupActivity, loadActivity, logActivity, todaysActivity } from "./activityLog";
import { statusDue } from "../character/statusUpdates";

afterEach(() => localStorage.clear());

describe("life dial (#131)", () => {
  it("is Normal by default and scales every waiting time", () => {
    expect(loadLifeDial()).toBe("normal");
    expect(lifeScaled(1000)).toBe(1000);
    saveLifeDial("quiet");
    expect(lifeScaled(1000)).toBe(2000);
    expect(lifeScaled(1000, "lively")).toBe(500);
  });

  it("makes a status due later when Quiet", () => {
    const now = Date.UTC(2026, 9, 25, 12);
    const posted = { postsStatuses: true, statuses: [{ id: "s", text: "x", createdAt: now - 12 * 3_600_000 }] };
    expect(statusDue(posted, now)).toBe(true);
    saveLifeDial("quiet");
    expect(statusDue(posted, now)).toBe(false);
  });
});

describe("activity log (#131)", () => {
  it("keeps entries, counts today's and groups them newest first", () => {
    const now = new Date(2026, 9, 25, 15, 0).getTime();
    logActivity({ kind: "status", text: "Aria posted a status", at: now - 10 * 60_000, cost: 0.002 });
    logActivity({ kind: "letter", text: "Kai wrote you a letter", at: now - 3 * 3_600_000 });
    logActivity({ kind: "talk", text: "Old talk", at: now - 3 * 24 * 3_600_000 });
    expect(loadActivity()).toHaveLength(3);
    expect(todaysActivity(loadActivity(), now)).toEqual({ count: 2, cost: 0.002 });
    expect(groupActivity(loadActivity(), now).map((g) => [g.label, g.entries.map((e) => e.text)])).toEqual([
      ["Last hour", ["Aria posted a status"]],
      ["Earlier today", ["Kai wrote you a letter"]],
      ["Older", ["Old talk"]],
    ]);
  });
});
