import { buildGoalNote, buildGoalPrompt, cleanGoal, GOAL_FOR_MS, needsGoal, parseGoalProgress } from "./goals";
import { buildWorldTalkPrompt } from "./worldTalk";
import { Character } from "../../types";

const NOW = 1_000_000_000_000;
const mara = { id: 1, name: "Mara Lind", prompt: "A baker.", goal: { text: "Mara wants to win back her old stall at the market.", setAt: NOW } } as Character;
const jon = { id: 2, name: "Jon", prompt: "A clerk." } as Character;

describe("goals (#208)", () => {
  it("picks a new one when there's none or a week has passed", () => {
    expect(needsGoal(jon, NOW)).toBe(true);
    expect(needsGoal(mara, NOW + 1000)).toBe(false);
    expect(needsGoal(mara, NOW + GOAL_FOR_MS)).toBe(true);
    expect(buildGoalPrompt(mara, "Harbour Town")).toContain("What they wanted last week: Mara wants to win back her old stall");
    expect(cleanGoal('"Jon wants to ask for a raise."\nextra')).toBe("Jon wants to ask for a raise.");
    expect(cleanGoal("ok")).toBeUndefined();
  });

  it("leans their talk only while the switch is on", () => {
    expect(buildWorldTalkPrompt(mara, jon, { userName: "Sam", maxLines: 6, goals: true })).toContain("What Mara Lind wants this week: Mara wants to win back her old stall");
    expect(buildWorldTalkPrompt(mara, jon, { userName: "Sam", maxLines: 6, goals: true })).toContain("GOAL:");
    expect(buildWorldTalkPrompt(mara, jon, { userName: "Sam", maxLines: 6 })).not.toContain("wants this week");
    expect(buildGoalNote(mara)).toContain("It colours what you bring up");
    expect(buildGoalNote(jon)).toBeUndefined();
  });

  it("reads what a talk moved on, by first name too", () => {
    const reply = "Mara: so?\nJon: I'll ask my uncle\nGOAL: Mara: Jon will ask his uncle about the stall\nGOAL: Jon: done\nGOAL: Nobody: x";
    expect(parseGoalProgress(reply, [mara, jon])).toEqual([
      { id: 1, progress: "Jon will ask his uncle about the stall", done: false },
      { id: 2, progress: "done", done: true },
    ]);
  });
});
