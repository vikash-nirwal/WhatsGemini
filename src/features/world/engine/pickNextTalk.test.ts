import { pickNextTalk } from "./pickNextTalk";
import { resetScheduler } from "../../life/scheduler";
import { Character, World } from "../../../types";

const worlds = [{ id: 5, name: "Harbour Town", premise: "A rainy port." }] as World[];
// Noon, when everyone without a schedule is awake.
const NOW = new Date(2026, 9, 27, 12).getTime();
const aria = { id: 1, name: "Aria", prompt: "x", knowsAbout: [2] } as Character;
const kai = { id: 2, name: "Kai", prompt: "x" } as Character;
const bram = { id: 3, name: "Bram", prompt: "x", worldId: 5 } as Character;
// They've met (#236); strangers wouldn't talk on their own.
const tess = { id: 4, name: "Tess", prompt: "x", worldId: 5, met: [3] } as Character;

afterEach(resetScheduler);

test("worlds take turns at talking, Default among them (#209)", () => {
  const people = [aria, kai, bram, tess];
  expect(pickNextTalk(people, worlds, NOW)?.map((c) => c.id)).toEqual([1, 2]);
  // My world just had its turn, so Harbour Town goes next, though nobody
  // there has talked yet either.
  expect(pickNextTalk(people, worlds, NOW + 1)?.map((c) => c.id)).toEqual([3, 4]);
});

test("strangers in one world don't talk on their own", () => {
  expect(pickNextTalk([bram, { ...tess, met: undefined }], worlds, NOW)).toBeUndefined();
  // In a group chat together they know each other.
  expect(pickNextTalk([bram, { ...tess, met: undefined }], worlds, NOW + 2, [{ id: 9, title: "G", timestamp: 0, content: [], characterIds: [3, 4] } as never])?.map((c) => c.id)).toEqual([3, 4]);
});

test("a world with nobody to talk doesn't hold up the others", () => {
  expect(pickNextTalk([bram, tess], worlds, NOW)?.map((c) => c.id)).toEqual([3, 4]);
  expect(pickNextTalk([aria], worlds, NOW)).toBeUndefined();
});
