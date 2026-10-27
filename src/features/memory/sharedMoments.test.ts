import { adventureFactsFor, groupFactsFor, rememberFacts } from "./sharedMoments";

const NOW = 1_800_000_000_000;

describe("memory that crosses from a group or a story (sharedMoments)", () => {
  it("labels a group's new facts with the group, keeping their categories", () => {
    const { facts, categories } = groupFactsFor("Bonfire", ["Sam can't swim."], { "Sam can't swim.": "user" });
    expect(facts).toEqual(['In the group "Bonfire": Sam can\'t swim.']);
    expect(categories).toEqual({ 'In the group "Bonfire": Sam can\'t swim.': "user" });
  });

  it("adds them to a character's memory once, with the date learned", () => {
    const aria = { memory: ["Sam likes jazz."], memoryDates: { "Sam likes jazz.": { learnedAt: 1 } } };
    const patch = rememberFacts(aria, ['In the group "Bonfire": Sam can\'t swim.'], undefined, NOW);
    expect(patch.memory).toEqual(["Sam likes jazz.", 'In the group "Bonfire": Sam can\'t swim.']);
    expect(patch.memoryDates?.['In the group "Bonfire": Sam can\'t swim.']).toEqual({ learnedAt: NOW });
    expect(patch.memoryDates?.["Sam likes jazz."]).toEqual({ learnedAt: 1 });
    expect(rememberFacts({ ...aria, memory: patch.memory }, ['In the group "Bonfire": Sam can\'t swim.'], undefined, NOW)).toEqual({});
  });

  it("gives each cast member only the story facts they were part of", () => {
    const facts = ["Aria found the silver key.", "Kai lost his sword.", "The party crossed the river."];
    expect(adventureFactsFor("The Deep Wood", facts, "Aria Vale")).toEqual(['In the story "The Deep Wood": Aria found the silver key.', 'In the story "The Deep Wood": The party crossed the river.']);
    expect(adventureFactsFor("The Deep Wood", ["Mariana sang."], "Mari")).toEqual([]);
  });
});
