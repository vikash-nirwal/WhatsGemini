import { buildScheduleSection, cleanSchedule, currentBlock, presenceFor, replyDelayMs, TYPICAL_DAY } from "./schedule";

const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m).getTime();
const day = { blocks: TYPICAL_DAY };

describe("currentBlock", () => {
  it("finds the block for the time, including ones that wrap past midnight", () => {
    expect(currentBlock(day, at(10))?.activity).toBe("at work");
    expect(currentBlock(day, at(23, 30))?.status).toBe("asleep");
    expect(currentBlock({ blocks: [{ start: 22, end: 6, activity: "asleep", status: "asleep" }] }, at(3))?.status).toBe("asleep");
    expect(currentBlock(undefined, at(10))).toBeUndefined();
  });
});

describe("presenceFor", () => {
  it("is online when free, and shows the activity and last seen otherwise", () => {
    expect(presenceFor(day, at(19))).toEqual({ online: true, label: "online" });
    expect(presenceFor(day, at(10), at(8))).toEqual({ online: false, label: "at work · last seen 2h ago" });
    expect(presenceFor(day, at(3))).toEqual({ online: false, label: "asleep" });
  });
});

describe("buildScheduleSection", () => {
  it("tells the character their routine and what they're doing now", () => {
    const text = buildScheduleSection(day, at(10))!;
    expect(text).toContain("09:00-17:00 at work");
    expect(text).toContain("Right now you're at work. You're busy right now");
    expect(buildScheduleSection(day, at(2))).toContain("You're asleep right now");
  });
});

describe("replyDelayMs", () => {
  it("waits only for realistic schedules, and longer when asleep", () => {
    expect(replyDelayMs(day, at(10), () => 0.5)).toBe(0);
    expect(replyDelayMs({ ...day, realistic: true }, at(19), () => 0.5)).toBe(0);
    expect(replyDelayMs({ ...day, realistic: true }, at(10), () => 0)).toBe(15_000);
    expect(replyDelayMs({ ...day, realistic: true }, at(3), () => 1)).toBe(120_000);
  });
});

describe("cleanSchedule", () => {
  it("drops empty blocks and an empty schedule", () => {
    expect(cleanSchedule({ blocks: [{ start: 9, end: 9, activity: "x", status: "busy" }, { start: 1, end: 2, activity: " ", status: "free" }] })).toBeUndefined();
    expect(cleanSchedule({ blocks: [{ start: 9, end: 17, activity: " work ", status: "busy" }], realistic: false })).toEqual({ blocks: [{ start: 9, end: 17, activity: "work", status: "busy" }], realistic: undefined });
  });
});
