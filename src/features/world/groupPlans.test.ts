import { buildPlanOutcomePrompt, cleanOutcome, planMemory, planScenario } from "./groupPlans";

test("a plan's chat and outcome name it, the people and when", () => {
  expect(planScenario({ title: "Beach bonfire", when: "Saturday night" }, ["Aria", "Kai"], "Sam")).toContain("The group chat for a plan: Beach bonfire, Saturday night. Sam set it up with Aria, Kai.");
  const prompt = buildPlanOutcomePrompt({ title: "Beach bonfire" }, ["Aria", "Kai"], "Sam", "Aria: I'll bring marshmallows", "it rained");
  expect(prompt).toContain("Aria: I'll bring marshmallows");
  expect(prompt).toContain("How Sam says it went: it rained");
  expect(planMemory({ title: "Beach bonfire" }, "It rained, they laughed.", "Sam")).toBe("Beach bonfire with Sam and the others happened: It rained, they laughed.");
  expect(cleanOutcome("ok")).toBeUndefined();
});

test("a dated plan is remembered the day before and resolves after its day (#184)", () => {
  const { planReminderDue, planPassed } = require("./groupPlans");
  const plan = { title: "Bonfire", memberIds: [1, 2], at: 0, date: "2026-10-25" };
  const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
  expect(planReminderDue(plan, at(24, 10))).toBe(true);
  expect(planReminderDue(plan, at(24, 7))).toBe(false);
  expect(planReminderDue({ ...plan, remindedAt: 1 }, at(24, 10))).toBe(false);
  expect(planReminderDue(plan, at(25, 10))).toBe(false);
  expect(planPassed(plan, at(25, 23))).toBe(false);
  expect(planPassed(plan, at(26, 1))).toBe(true);
  expect(planPassed({ ...plan, outcome: "fun" }, at(27, 1))).toBe(false);
  expect(planPassed({ ...plan, date: undefined }, at(27, 1))).toBe(false);
});

test("a dated plan becomes a calendar entry with a reminder the day before (#195)", () => {
  const { planCalendarFile } = require("./groupPlans");
  const ics = planCalendarFile({ title: "Bonfire, beach", when: "Saturday night", date: "2026-10-31", at: 7 }, ["Aria", "Kai"], Date.UTC(2026, 9, 26, 12));
  expect(ics).toContain("DTSTART;VALUE=DATE:20261031");
  expect(ics).toContain("DTEND;VALUE=DATE:20261101");
  expect(ics).toContain("SUMMARY:Bonfire\\, beach");
  expect(ics).toContain("DESCRIPTION:With Aria\\, Kai - Saturday night. Planned in Kindred.");
  expect(ics).toContain("TRIGGER:-PT15H");
  expect(planCalendarFile({ title: "x", at: 1 }, [], 0)).toBeUndefined();
});
