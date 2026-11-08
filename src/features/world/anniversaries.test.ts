import { Character, World } from "../../types";
import { anniversariesOf, anniversaryNoteAmong, anniversaryNoteFor } from "./anniversaries";
import { worldContext } from "./canon";
import { formatStoryDate, skipStoryTime } from "./storyTime";
import type { TimelineEntry } from "./timeline";
import { buildInnerStateNote } from "./worldNow";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 8, 12).getTime();
const YEAR_AGO = new Date(2025, 10, 8, 18).getTime();
const entry = (id: string, at: number, kind: TimelineEntry["kind"], text: string, extra: Partial<TimelineEntry> = {}): TimelineEntry => ({ id, at, kind, text, ...extra });
const world: World = { id: 4, name: "Harbor Town", premise: "A fishing town." };
const aria: Character = { id: 1, name: "Aria", description: "", prompt: "", worldId: 4 };

describe("anniversaries (#244)", () => {
  const flood = entry("e1", YEAR_AGO, "event", "The Great Flood: the harbour went under.");
  const kiss = entry("e2", YEAR_AGO, "you", "You and Aria kissed on the pier", { characterIds: [1], audience: "private" });

  it("brings back a one-off event or a moment with you a year on", () => {
    expect(anniversaryNoteFor(1, [flood, kiss], world, NOW)).toBe(
      "Remembered this time of year: A year ago today, You and Aria kissed on the pier; A year ago today, The Great Flood: the harbour went under. Bring it up only if it fits, as a memory."
    );
    // A few days late it's "this week"; long after, or before the year is up, nothing.
    expect(anniversaryNoteFor(1, [flood], world, NOW + 2 * DAY)).toContain("A year ago this week");
    expect(anniversaryNoteFor(1, [flood], world, NOW + 10 * DAY)).toBeUndefined();
    expect(anniversaryNoteFor(1, [entry("e3", NOW - 200 * DAY, "event", "A storm")], world, NOW)).toBeUndefined();
    expect(anniversaryNoteFor(1, [entry("e4", new Date(2024, 10, 8).getTime(), "event", "The bridge opened")], world, NOW)).toContain("2 years ago today, The bridge opened");
  });

  it("leaves out traditions held again, endings and other kinds", () => {
    const list = [
      entry("a", YEAR_AGO, "event", "Lantern Night: lanterns on the water. As every year."),
      entry("b", YEAR_AGO, "event", "The fair is over"),
      entry("c", YEAR_AGO, "talk", "Aria and Kai talked"),
    ];
    expect(anniversariesOf(list, world, NOW)).toEqual([]);
  });

  it("only what that person could know", () => {
    expect(anniversaryNoteFor(2, [kiss], world, NOW)).toBeUndefined();
    expect(anniversaryNoteFor(2, [flood], world, NOW)).toContain("The Great Flood");
    // Among several, only what every one of them knows; with no one named, only the public.
    expect(anniversaryNoteAmong([1, 2], [kiss, flood], world, NOW)).not.toContain("kissed");
    expect(anniversaryNoteAmong([], [kiss, flood], world, NOW)).toContain("The Great Flood");
    expect(anniversaryNoteAmong([], [kiss], world, NOW)).toBeUndefined();
  });

  it("uses the world's own calendar when it keeps one, skips included", () => {
    const st0 = { year: 300, months: ["Thaw", "Bloom", "Sun", "Harvest"], daysPerMonth: 10, day: 12, anchorAt: YEAR_AGO, moves: false };
    const fest = entry("s1", YEAR_AGO, "event", "The Bloom fair burned", { storyDate: formatStoryDate(st0, YEAR_AGO) });
    // A story year (40 days) later, by a skip, though only a week passed for real.
    const st = skipStoryTime(st0, 40, YEAR_AGO + 7 * DAY);
    expect(anniversaryNoteFor(1, [fest], { storyTime: st }, YEAR_AGO + 7 * DAY)).toContain("A year ago today, The Bloom fair burned");
    // A real year on but the story calendar hasn't moved: not yet.
    expect(anniversaryNoteFor(1, [fest], { storyTime: st0 }, NOW)).toBeUndefined();
    // Entries from before the calendar can't be placed on it.
    expect(anniversaryNoteFor(1, [flood], { storyTime: st }, YEAR_AGO + 7 * DAY)).toBeUndefined();
  });

  it("reaches replies and background prompts", () => {
    expect(buildInnerStateNote(aria, world, [aria], NOW, [kiss])).toContain("A year ago today, You and Aria kissed on the pier");
    expect(worldContext(world, [], [aria], [flood], NOW).join("\n")).toContain("A year ago today, The Great Flood");
  });
});
