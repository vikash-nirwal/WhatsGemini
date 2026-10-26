import { appendEntry, groupTimeline, TimelineEntry } from "./timeline";

const e = (id: string, at: number, extra: Partial<TimelineEntry> = {}): TimelineEntry => ({ id, at, kind: "event", text: id, ...extra });

describe("world timeline (#161)", () => {
  it("keeps the newest entries", () => {
    let list: TimelineEntry[] = [];
    for (let i = 0; i < 405; i++) list = appendEntry(list, e(String(i), i));
    expect(list).toHaveLength(400);
    expect(list[0].id).toBe("5");
  });

  it("groups newest first by day, or by the world's own date", () => {
    const now = new Date(2026, 9, 26, 12).getTime();
    const groups = groupTimeline([e("old", now - 3 * 86_400_000), e("y", now - 86_400_000), e("a", now - 60_000), e("b", now)], now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", groups[2].label]);
    expect(groups[0].entries.map((x) => x.id)).toEqual(["b", "a"]);
    expect(groupTimeline([e("s", now, { storyDate: "Year 312, Frost, day 1" })], now)[0].label).toBe("Year 312, Frost, day 1");
  });
});
