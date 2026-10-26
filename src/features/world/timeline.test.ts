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

test("the world's notable past becomes history for prompts (#179)", () => {
  const { buildHistoryNote } = require("./timeline");
  const DAY = 86_400_000;
  const now = 30 * DAY;
  const entries = [
    { id: "1", at: 2 * DAY, kind: "event", text: "The Great Flood: the river burst its banks" },
    { id: "2", at: 5 * DAY, kind: "talk", text: "Aria and Kai talked about you" },
    { id: "3", at: 10 * DAY, kind: "arrival", text: "Mira arrived", storyDate: "3 Frost, Year 12" },
    { id: "4", at: now - 3600_000, kind: "event", text: "Fog Week began" },
  ];
  const note = buildHistoryNote(entries, now)!;
  expect(note).toContain("- 28 days ago: The Great Flood: the river burst its banks");
  expect(note).toContain("- 3 Frost, Year 12: Mira arrived");
  expect(note).not.toContain("talked about you");
  expect(note).not.toContain("Fog Week");
  expect(buildHistoryNote([], now)).toBeUndefined();
});
