import { advanceArc, buildArcNote, nextBeatDue, parseArc } from "./worldArcs";

const DAY = 24 * 60 * 60 * 1000;
const REPLY = "TITLE: The Drowned Bell\nBEAT 1: A bell rings under the harbour at night.\n**BEAT: Kai finds a rope cut clean.**\nBEAT: Aria hears the bell's story from her grandmother.";

test("an arc is read leniently, needs at least two beats", () => {
  const arc = parseArc(REPLY, 5)!;
  expect(arc.title).toBe("The Drowned Bell");
  expect(arc.beats).toEqual(["A bell rings under the harbour at night.", "Kai finds a rope cut clean.", "Aria hears the bell's story from her grandmother."]);
  expect(arc.step).toBe(0);
  expect(parseArc("TITLE: x\nBEAT: only one", 0)).toBeUndefined();
});

test("beats move on after a gap, and the arc ends after the last", () => {
  let arc = parseArc(REPLY, 0)!;
  expect(nextBeatDue(arc, DAY)).toBe(false);
  expect(nextBeatDue(arc, 2 * DAY)).toBe(true);
  arc = advanceArc(advanceArc(arc, DAY), 2 * DAY);
  expect(arc.step).toBe(2);
  arc = advanceArc(arc, 3 * DAY);
  expect(arc.doneAt).toBe(3 * DAY);
  expect(nextBeatDue(arc, 10 * DAY)).toBe(false);
  expect(buildArcNote(arc, "Sam")).toBeUndefined();
});

test("their prompts hear the story so far and what's happening now", () => {
  const arc = advanceArc(parseArc(REPLY, 0)!, DAY);
  const note = buildArcNote(arc, "Sam")!;
  expect(note).toContain('"The Drowned Bell"');
  expect(note).toContain("So far: A bell rings under the harbour at night.");
  expect(note).toContain("Happening now: Kai finds a rope cut clean.");
  expect(note).toContain("Sam is part of it");
});
