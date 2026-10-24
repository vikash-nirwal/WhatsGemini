import { buildLateReplyDirective, leftOnReadChance, leftOnReadDelay } from "./leftOnRead";

const NOW = new Date(2026, 9, 21, 12, 0, 0).getTime();

describe("left on read (#126)", () => {
  it("happens more often when they're busy, off, upset or fighting", () => {
    expect(leftOnReadChance({ id: 1 }, undefined, NOW)).toBe(0);
    expect(leftOnReadChance({ id: 1, leavesOnRead: 1 }, undefined, NOW)).toBeCloseTo(0.12);
    const busy = { blocks: [{ start: 0, end: 24, activity: "at work", status: "busy" as const }] };
    expect(leftOnReadChance({ id: 1, leavesOnRead: 1, schedule: busy }, { conflict: { since: NOW } as any }, NOW)).toBeCloseTo(0.57);
    expect(leftOnReadChance({ id: 1, leavesOnRead: 3 }, undefined, NOW)).toBe(1);
  });

  it("waits a few minutes to half an hour, or answers now", () => {
    expect(leftOnReadDelay({ id: 1, leavesOnRead: 3 }, undefined, NOW, () => 0.5)).toBe(14 * 60_000);
    expect(leftOnReadDelay({ id: 1, leavesOnRead: 1 }, undefined, NOW, () => 0.9)).toBe(0);
  });

  it("tells the late reply it's late", () => {
    expect(buildLateReplyDirective("Aria", "Sam", 14)).toContain("read Sam's message about 14 minutes ago and is only answering now");
  });
});
