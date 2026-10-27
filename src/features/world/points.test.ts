import { Character } from "../../types";
import { nudgeBond } from "./bonds";
import { DEFAULT_TRAITS, extractPointsTags, movePoints, startFor, stripStreamingPoints, traitsFrom, valuesOf } from "./points";
import { buildPointsNote, nudgePoints, pointsLine, pointsToward, replyPointsPatches, setPointsTo, YOU_MOMENTS } from "./pointsNotes";
import { saveWorldPrefs } from "./worldPrefs";

// Points (#234).
const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const char = (id: number, name: string, extra: Partial<Character> = {}): Character => ({ id, name, description: "", prompt: "", worldId: 4, ...extra });

beforeEach(() => {
  localStorage.clear();
  saveWorldPrefs(4, { points: true });
});

describe("points arithmetic", () => {
  it("uses the world's own traits, or the defaults", () => {
    expect(traitsFrom(undefined)).toEqual(DEFAULT_TRAITS);
    expect(traitsFrom([" Loyalty ", "loyalty", "Debt"])).toEqual(["loyalty", "debt"]);
  });

  it("starts from the tie and fades back to it", () => {
    expect(startFor("affection", 55)).toBe(7.8); // a sister
    expect(startFor("rivalry", -25)).toBe(3.1); // a rival
    const moved = movePoints(undefined, ["trust"], 10, { trust: -5 }, NOW, "lied about the boat")!;
    expect(moved.values.trust).toBe(3.4); // one step is at most 2
    expect(moved.why).toEqual([{ text: "lied about the boat", at: NOW }]);
    expect(valuesOf(moved, ["trust"], 10, NOW + 21 * DAY).trust).toBe(4.4); // half way back after three weeks
    expect(movePoints(undefined, ["trust"], 10, { honor: 1 }, NOW)).toBeUndefined();
  });

  it("reads and strips the reply tag", () => {
    expect(extractPointsTags("Fine.\n[Points: trust +1, affection -0.5]")).toEqual({ text: "Fine.", changes: [{ deltas: { trust: 1, affection: -0.5 } }] });
    expect(extractPointsTags("Ugh. [Points Kai: rivalry +2]").changes).toEqual([{ toward: "Kai", deltas: { rivalry: 2 } }]);
    expect(extractPointsTags("no tags [here]").text).toBe("no tags [here]");
    expect(stripStreamingPoints("Fine. [Poi")).toBe("Fine.");
  });
});

describe("points toward you and each other", () => {
  it("moves with world life through the bonds, only with the switch on", () => {
    const aria = char(1, "Aria");
    expect(nudgeBond(aria, 2, { closeness: 10, tension: 20 }, NOW, "argued").bonds![0].points?.values).toMatchObject({ affection: 6.5, rivalry: 3, trust: 4.4 });
    saveWorldPrefs(4, { points: false });
    expect(nudgeBond(aria, 2, { closeness: 10 }, NOW).bonds![0].points).toBeUndefined();
    expect(nudgePoints(aria, "you", YOU_MOMENTS.gift, NOW)).toEqual({});
  });

  it("moves toward you on moments and replies, and by hand", () => {
    const aria = char(1, "Aria", { relationship: "girlfriend" });
    expect(pointsToward(aria, "you", NOW).attraction).toBe(7);
    const gifted = { ...aria, ...nudgePoints(aria, "you", YOU_MOMENTS.gift, NOW, "you gave her a scarf") };
    expect(pointsToward(gifted, "you", NOW).affection).toBe(9.5);
    const kai = char(2, "Kai Moreno");
    const patch = replyPointsPatches(gifted, [{ deltas: { trust: -1 } }, { toward: "kai", deltas: { rivalry: 1 } }, { toward: "Nobody", deltas: { trust: 5 } }], [gifted, kai], NOW, "in chat");
    expect(patch.youPoints?.values.trust).toBe(7.3);
    expect(patch.bonds?.find((b) => b.withId === 2)?.points?.values.rivalry).toBe(2);
    expect({ ...aria, ...setPointsTo(aria, 2, "trust", 9, NOW) }.bonds?.[0].points?.values.trust).toBe(9);
  });

  it("tells the reply and the talk how they score", () => {
    const aria = char(1, "Aria", { youPoints: { values: { trust: 2 }, at: NOW, why: [{ text: "you lied", at: NOW }] } });
    const kai = char(2, "Kai");
    const note = buildPointsNote(aria, "Sam", [aria, kai], NOW)!;
    expect(note).toContain("- Toward Sam: affection 5.5 (middling), trust 2 (low)");
    expect(note).toContain("(lately: you lied)");
    expect(note).toContain("- Toward Kai:");
    expect(note).toContain("[Points: trust +1, affection -1]");
    expect(buildPointsNote(char(1, "Aria", { worldId: 9 }), "Sam", [], NOW)).toBeUndefined();
    expect(pointsLine(aria, kai, NOW)).toContain("Aria toward Kai: affection 6");
  });
});
