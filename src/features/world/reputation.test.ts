import { buildReputationNote, buildReputationPrompt, cleanReputation, reputationDue } from "./reputation";
import { Character } from "../../types";

const DAY = 24 * 60 * 60 * 1000;

test("it's rewritten every few days", () => {
  expect(reputationDue({}, 4 * DAY)).toBe(true);
  expect(reputationDue({ reputation: { text: "x", at: 0 } }, 2 * DAY)).toBe(false);
  expect(reputationDue({ reputation: { text: "x", at: 0 } }, 3 * DAY)).toBe(true);
});

test("the prompt gathers what people know and say", () => {
  const cast = [{ id: 1, name: "Aria", relationship: "neighbour", memory: ["Sam fixed her boat"] }, { id: 2, name: "Kai" }] as Character[];
  const prompt = buildReputationPrompt({ name: "Harbour Town", premise: "A port." }, "Sam", cast, ["Kai: Sam? the one who fixed Aria's boat?"]);
  expect(prompt).toContain("- Aria (Sam is their neighbour): knows Sam fixed her boat");
  expect(prompt).not.toMatch(/^- Kai$/m);
  expect(prompt).toContain("Kai: Sam? the one who fixed Aria's boat?");
});

test("strangers go by it, friends weigh it", () => {
  const world = { name: "Harbour Town", reputation: { text: "Sam is the outsider who fixes boats.", at: 0 } };
  expect(buildReputationNote(world, "Sam", true)).toContain("this is all you have to go on");
  expect(buildReputationNote(world, "Sam", false)).toContain("you know them yourself");
  expect(buildReputationNote({ name: "X" }, "Sam", true)).toBeUndefined();
  expect(cleanReputation('"Short."')).toBeUndefined();
});
