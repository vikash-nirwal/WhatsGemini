import { pickNextTalk } from "./pickNextTalk";
import { resetScheduler } from "../../life/scheduler";
import { Character, World } from "../../../types";

const worlds = [{ id: 5, name: "Harbour Town", premise: "A rainy port." }] as World[];
// Noon, when everyone without a schedule is awake.
const NOW = new Date(2026, 9, 27, 12).getTime();
const aria = { id: 1, name: "Aria", prompt: "x", knowsAbout: [2] } as Character;
const kai = { id: 2, name: "Kai", prompt: "x" } as Character;
const bram = { id: 3, name: "Bram", prompt: "x", worldId: 5 } as Character;
const tess = { id: 4, name: "Tess", prompt: "x", worldId: 5 } as Character;

afterEach(resetScheduler);

test("worlds take turns at talking, My world among them (#209)", () => {
  const people = [aria, kai, bram, tess];
  expect(pickNextTalk(people, worlds, NOW)?.map((c) => c.id)).toEqual([1, 2]);
  // My world just had its turn, so Harbour Town goes next, though nobody
  // there has talked yet either.
  expect(pickNextTalk(people, worlds, NOW + 1)?.map((c) => c.id)).toEqual([3, 4]);
});

test("a world with nobody to talk doesn't hold up the others", () => {
  expect(pickNextTalk([bram, tess], worlds, NOW)?.map((c) => c.id)).toEqual([3, 4]);
  expect(pickNextTalk([aria], worlds, NOW)).toBeUndefined();
});
