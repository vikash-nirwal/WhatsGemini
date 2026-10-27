import { bondOf, bondWords, intensity, lifeEventTone, moodOf, nudgeBond, nudgeMood, standingLine, talkGapFor, tieBaseline, tieShift, tieUnderStrain, weightedPick } from "./bonds";
import { buildRelationshipMap } from "../character/relationshipMap";
import { Character, Chat } from "../../types";

const DAY = 86_400_000;
const NOW = 1_000_000_000_000;
const aria = { id: 1, name: "Aria", prompt: "x", ties: [{ withId: 2, tie: "your sister" }] } as Character;
const kai = { id: 2, name: "Kai", prompt: "x", ties: [{ withId: 1, tie: "your sister" }] } as Character;

test("a tie's words say where closeness rests", () => {
  expect(tieBaseline(undefined)).toBe(10);
  expect(tieBaseline("your friend")).toBe(40);
  expect(tieBaseline("your best friend")).toBe(55);
  expect(tieBaseline("your ex-girlfriend")).toBe(-25);
  expect(tieBaseline("your rival")).toBe(-25);
  expect(tieBaseline("your wife")).toBe(70);
});

test("with nothing nudged, a bond is the tie's resting place and no tension", () => {
  expect(bondOf(aria, 2, NOW)).toMatchObject({ closeness: 55, tension: 0 });
  expect(bondOf(aria, 9, NOW)).toMatchObject({ closeness: 10, tension: 0 });
});

test("nudges add up, stay in range, and fade back with time", () => {
  const once = { ...aria, ...nudgeBond(aria, 2, { closeness: -60, tension: 80 }, NOW) };
  expect(bondOf(once, 2, NOW)).toMatchObject({ closeness: -5, tension: 80 });
  const twice = { ...once, ...nudgeBond(once, 2, { tension: 50 }, NOW) };
  expect(bondOf(twice, 2, NOW).tension).toBe(100);
  // Tension halves in three days; closeness heads back to the sister's 55.
  const later = bondOf(twice, 2, NOW + 3 * DAY);
  expect(Math.round(later.tension)).toBe(50);
  expect(later.closeness).toBeGreaterThan(-5);
  expect(later.closeness).toBeLessThan(55);
});

test("moods fade to even in a couple of days", () => {
  const low = { ...aria, ...nudgeMood(aria, -60, NOW) };
  expect(moodOf(low, NOW)).toBe(-60);
  expect(Math.round(moodOf(low, NOW + 2 * DAY))).toBe(-30);
  expect(moodOf(aria, NOW)).toBe(0);
});

test("a tie changing for the worse leaves tension; for the better, eases it", () => {
  expect(tieShift("your friend", "your rival")).toEqual({ closeness: -32.5, tension: 25 });
  expect(tieShift("your rival", "your friend")).toEqual({ closeness: 32.5, tension: -10 });
});

test("a life event's tone, from its words", () => {
  expect(lifeEventTone("Kai got the job at the docks")).toBe(25);
  expect(lifeEventTone("Kai lost his job at the docks")).toBe(-25);
  expect(lifeEventTone("Kai repainted the boat")).toBe(0);
});

test("charged pairs talk sooner, and strained ties may change", () => {
  const strangers = [{ id: 3, name: "M", prompt: "x" }, { id: 4, name: "N", prompt: "x" }] as Character[];
  expect(talkGapFor(1000, strangers[0], strangers[1], NOW)).toBe(950);
  expect(intensity(aria, kai, NOW)).toBe(55);
  const tense = { ...aria, ...nudgeBond(aria, 2, { tension: 70 }, NOW) };
  expect(talkGapFor(1000, tense, kai, NOW)).toBe(650);
  expect(tieUnderStrain(aria, 2, NOW)).toBe(false);
  expect(tieUnderStrain(tense, 2, NOW)).toBe(true);
  const cold = { ...aria, ...nudgeBond(aria, 2, { closeness: -45 }, NOW) };
  expect(tieUnderStrain(cold, 2, NOW)).toBe(true);
});

test("the talk prompt hears how they stand only when something stands out", () => {
  expect(standingLine(aria, kai, NOW)).toBeUndefined();
  const tense = { ...aria, ...nudgeBond(aria, 2, { tension: 50 }, NOW), ...nudgeMood(aria, -40, NOW) };
  expect(standingLine(tense, kai, NOW)).toBe("How they are lately: things between Aria and Kai have been tense lately; Aria has been low lately. Let it show without saying it outright.");
});

test("weighted picks lean to the heavier item", () => {
  expect(weightedPick(["a", "b"], (x) => (x === "a" ? 1 : 3), () => 0.2)).toBe("a");
  expect(weightedPick(["a", "b"], (x) => (x === "a" ? 1 : 3), () => 0.3)).toBe("b");
  expect(weightedPick([], () => 1)).toBeUndefined();
});

test("the relationship map says how close or tense, once it has moved (#211)", () => {
  const tense = { ...aria, ...nudgeBond(aria, 2, { tension: 40 }, NOW) };
  const chats = [{ id: 1, characterIds: [1] }, { id: 2, characterIds: [2] }] as Chat[];
  const { links } = buildRelationshipMap([tense, kai], chats, NOW);
  expect(links[0].feelings).toContain("Aria about Kai: close, tense");
  expect(bondWords(kai, 1, NOW)).toBe("close");
});
