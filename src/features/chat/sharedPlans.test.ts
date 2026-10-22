import { SharedPlan } from "../../types";
import { applyPlanChanges, buildPlansPrompt, buildPlansSection, daysUntilPlan, mentionsOpenPlan, mentionsPlan, parsePlansReply } from "./sharedPlans";

const NOW = new Date(2026, 9, 22, 12).getTime(); // Thursday
const plan = (what: string, extra: Partial<SharedPlan> = {}): SharedPlan => ({ id: what, what, createdAt: NOW - 1000, ...extra });

describe("shared plans", () => {
  it("only asks when the exchange sounds like a plan or mentions an open one", () => {
    expect(mentionsPlan("Let's go to the fair")).toBe(true);
    expect(mentionsPlan("See you on Saturday!")).toBe(true);
    expect(mentionsPlan("I had soup for lunch.")).toBe(false);
    expect(mentionsOpenPlan("*unpacks the picnic basket*", [plan("Picnic by the lake")])).toBe(true);
    expect(mentionsOpenPlan("Nice weather.", [plan("Picnic by the lake")])).toBe(false);
  });

  it("gives the helper today's date and the open plans by number", () => {
    const prompt = buildPlansPrompt("Aria", "Sam", [plan("Picnic", { when: "Saturday" })], "Sam: Let's!", NOW);
    expect(prompt).toContain("today is Thursday, October 22, 2026 (2026-10-22)");
    expect(prompt).toContain("1. Picnic (Saturday)");
  });

  it("parses new and done plans defensively", () => {
    expect(parsePlansReply('```json\n{"new": [{"what": "Picnic", "when": "Saturday", "date": "2026-10-24"}], "done": [2, 9, "x"]}\n```', 2)).toEqual({
      added: [{ what: "Picnic", when: "Saturday", date: "2026-10-24" }],
      doneIndexes: [1],
    });
    expect(parsePlansReply("no idea", 0)).toEqual({ added: [], doneIndexes: [] });
    expect(parsePlansReply('{"new": [{"what": "x", "date": "Saturday"}]}', 0).added[0].date).toBeUndefined();
  });

  it("adds new plans once and ticks off done ones among the open plans", () => {
    const plans = [plan("Done before", { doneAt: NOW - 5000 }), plan("Picnic"), plan("Movie night")];
    const next = applyPlanChanges(plans, { added: [{ what: "picnic" }, { what: "Stargazing" }], doneIndexes: [1] }, NOW);
    expect(next.map((p) => [p.what, Boolean(p.doneAt)])).toEqual([["Done before", true], ["Picnic", false], ["Movie night", true], ["Stargazing", false]]);
  });

  it("counts days to a plan's date", () => {
    expect(daysUntilPlan(plan("a", { date: "2026-10-22" }), NOW)).toBe(0);
    expect(daysUntilPlan(plan("a", { date: "2026-10-24" }), NOW)).toBe(2);
    expect(daysUntilPlan(plan("a", { date: "2026-10-20" }), NOW)).toBe(-2);
    expect(daysUntilPlan(plan("a"), NOW)).toBeUndefined();
  });

  it("tells the character about open plans, calling out today's", () => {
    const section = buildPlansSection([plan("Picnic", { date: "2026-10-22" }), plan("Movie night", { when: "next week" }), plan("Old", { doneAt: NOW })], "Sam", NOW)!;
    expect(section).toContain("- Picnic - that's TODAY");
    expect(section).toContain("- Movie night (next week)");
    expect(section).not.toContain("Old");
    expect(section).toContain("Today is the day for picnic");
    expect(buildPlansSection([plan("Old", { doneAt: NOW })], "Sam", NOW)).toBeUndefined();
  });
});
