import { backgroundCallsPerDay, LIFE_PRESETS, lifeOf, presetOf } from "./lifePresets";

describe("life presets (#154)", () => {
  it("recognises a preset from its switches, and anything else as custom", () => {
    for (const p of LIFE_PRESETS) expect(presetOf(p.values)).toBe(p.id);
    const texter = LIFE_PRESETS.find((p) => p.id === "texter")!.values;
    expect(presetOf({ ...texter, dreams: true })).toBeUndefined();
    // How often they leave you on read doesn't change which preset it is.
    expect(presetOf({ ...texter, leavesOnRead: 3 })).toBe("texter");
  });

  it("reads a character's switches and counts the background calls", () => {
    expect(lifeOf({ name: "Aria", textsFirst: true, dreams: true } as never)).toMatchObject({ textsFirst: true, dreams: true, diaryEnabled: undefined });
    expect(backgroundCallsPerDay(lifeOf({}))).toBe(0);
    expect(backgroundCallsPerDay(lifeOf({ textsFirst: true, innerThoughts: true }))).toBe(5);
  });
});
