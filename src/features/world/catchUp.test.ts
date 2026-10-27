import { buildCatchUpPrompt, catchUpFacts, catchUpTitle, cleanCatchUp, daysAway, driftWhileAway } from "./catchUp";
import { bondOf, nudgeBond } from "./bonds";
import { Character } from "../../types";
import type { TimelineEntry } from "./timeline";

const DAY = 86_400_000;
const NOW = 1_000_000_000_000;
const aria = { id: 1, name: "Aria", prompt: "x", worldId: 5, ties: [{ withId: 2, tie: "your sister" }] } as Character;
const kai = { id: 2, name: "Kai", prompt: "x", worldId: 5, ties: [{ withId: 1, tie: "your sister" }] } as Character;
const mara = { id: 3, name: "Mara", prompt: "x", worldId: 5 } as Character;

test("days away count up to two weeks", () => {
  expect(daysAway(NOW - 3 * DAY, NOW)).toBe(3);
  expect(daysAway(NOW - 40 * DAY, NOW)).toBe(14);
});

test("while you're away, tied pairs drift, each side the same, a nudge per day", () => {
  // Rolls: a rough patch, a warm day, an ordinary day.
  const rolls = [0.05, 0.2, 0.9];
  let i = 0;
  const patches = driftWhileAway([aria, kai, mara], NOW - 3 * DAY, NOW, () => rolls[i++ % rolls.length]);
  expect(Array.from(patches.keys()).sort()).toEqual([1, 2]);
  const after = { ...aria, ...patches.get(1)!(aria) };
  // The sister's resting 55, -5 then +4; tension 15.
  expect(bondOf(after, 2, NOW)).toMatchObject({ closeness: 54, tension: 15 });
  const kaiAfter = { ...kai, ...patches.get(2)!(kai) };
  expect(bondOf(kaiAfter, 1, NOW)).toMatchObject({ closeness: 54, tension: 15 });
  // Less than a day away: nothing moves.
  expect(driftWhileAway([aria, kai], NOW - 20 * 3_600_000, NOW, () => 0).size).toBe(0);
});

test("the story is told from what was recorded meanwhile, never secrets, and how people stand", () => {
  const entries = [
    { id: "a", at: NOW - 10 * DAY, kind: "event", text: "Too old" },
    { id: "b", at: NOW - 2 * DAY, kind: "event", text: "The Lantern Festival began" },
    { id: "c", at: NOW - DAY, kind: "you", text: "A secret thing", audience: "secret" },
    { id: "d", at: NOW - DAY, kind: "tie", text: "Kai is now Mara's friend" },
  ] as TimelineEntry[];
  const tense = { ...aria, ...nudgeBond(aria, 2, { tension: 50 }, NOW) };
  expect(catchUpFacts([tense, kai, mara], entries, NOW - 3 * DAY, NOW)).toEqual(["The Lantern Festival began", "Kai is now Mara's friend", "Aria and Kai: close, tense"]);
});

test("the prompt, the cleaned reply and the card's heading", () => {
  const prompt = buildCatchUpPrompt({ name: "Harbor Bay", premise: "a foggy fishing town" }, ["The Lantern Festival began"], 5, "Sam");
  expect(prompt).toContain("Sam has been away from Harbor Bay (a foggy fishing town) for 5 days.");
  expect(prompt).toContain("- The Lantern Festival began");
  expect(cleanCatchUp("Here's what you missed:\nThe lanterns went up all week and Kai got the job.")).toBe("The lanterns went up all week and Kai got the job.");
  expect(cleanCatchUp("ok")).toBeUndefined();
  expect(catchUpTitle({ name: "Harbor Bay" }, NOW - DAY, NOW)).toBe("Since yesterday in Harbor Bay");
  expect(catchUpTitle({ name: "Harbor Bay" }, NOW - 4 * DAY, NOW)).toBe("These 4 days in Harbor Bay");
  expect(catchUpTitle({ name: "Harbor Bay" }, NOW - 8 * DAY, NOW)).toBe("This past week in Harbor Bay");
});
