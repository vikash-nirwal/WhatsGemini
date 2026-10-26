import { buildPlanOutcomePrompt, cleanOutcome, planMemory, planScenario } from "./groupPlans";

test("a plan's chat and outcome name it, the people and when", () => {
  expect(planScenario({ title: "Beach bonfire", when: "Saturday night" }, ["Aria", "Kai"], "Sam")).toContain("The group chat for a plan: Beach bonfire, Saturday night. Sam set it up with Aria, Kai.");
  const prompt = buildPlanOutcomePrompt({ title: "Beach bonfire" }, ["Aria", "Kai"], "Sam", "Aria: I'll bring marshmallows", "it rained");
  expect(prompt).toContain("Aria: I'll bring marshmallows");
  expect(prompt).toContain("How Sam says it went: it rained");
  expect(planMemory({ title: "Beach bonfire" }, "It rained, they laughed.", "Sam")).toBe("Beach bonfire with Sam and the others happened: It rained, they laughed.");
  expect(cleanOutcome("ok")).toBeUndefined();
});
