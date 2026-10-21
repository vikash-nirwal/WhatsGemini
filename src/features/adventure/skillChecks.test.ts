import { buildSkillCheckDirective, describeCheck, parseChoiceCheck, rollCheck, withCheckNote } from "./skillChecks";

const persona = { skills: [{ name: "Dexterity", modifier: 2 }, { name: "Charisma", modifier: -1 }] };
// rollDice maps random() onto 1-20: 0.5 rolls an 11.
const rolls = (n: number) => () => (n - 1) / 20;

describe("parseChoiceCheck", () => {
  it("takes a trailing check off the label", () => {
    expect(parseChoiceCheck({ id: "c1", label: "Pick the lock [Dexterity DC 14]" })).toEqual({ id: "c1", label: "Pick the lock", check: { skill: "Dexterity", dc: 14 } });
    expect(parseChoiceCheck({ id: "c2", label: "Jump the gap (DC 12)" })).toEqual({ id: "c2", label: "Jump the gap", check: { dc: 12 } });
    expect(parseChoiceCheck({ id: "c3", label: "Talk to the guard" })).toEqual({ id: "c3", label: "Talk to the guard" });
  });
});

describe("rollCheck", () => {
  it("adds the persona's skill and compares with the DC", () => {
    expect(rollCheck({ skill: "dexterity", dc: 14 }, persona, rolls(12))).toEqual({ skill: "dexterity", dc: 14, roll: 12, modifier: 2, total: 14, success: true });
    expect(rollCheck({ skill: "Charisma", dc: 10 }, persona, rolls(10)).success).toBe(false);
    expect(rollCheck({ dc: 10 }, undefined, rolls(10)).modifier).toBe(0);
  });

  it("a natural 20 always works, a natural 1 always fails", () => {
    expect(rollCheck({ dc: 25 }, undefined, rolls(20)).success).toBe(true);
    expect(rollCheck({ skill: "Dexterity", dc: 2 }, persona, rolls(1)).success).toBe(false);
  });
});

describe("telling the player and the narrator", () => {
  const check = { skill: "Dexterity", dc: 14, roll: 12, modifier: 2, total: 14, success: true };
  it("describes the roll", () => {
    expect(describeCheck(check)).toBe("Dexterity 12 + 2 = 14 vs DC 14: success");
    expect(withCheckNote("Pick the lock", check)).toBe("Pick the lock\n\n(Skill check, Dexterity: rolled 12 + 2 = 14 against DC 14. Success: narrate the outcome as a success.)");
    expect(withCheckNote("Look around", undefined)).toBe("Look around");
  });

  it("asks for checks with the persona's skills", () => {
    expect(buildSkillCheckDirective(persona)).toContain("Use the player's own skills where they fit: Dexterity, Charisma.");
    expect(buildSkillCheckDirective(undefined)).not.toContain("own skills");
  });
});
