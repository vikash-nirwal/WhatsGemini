import { addLifeEvent, buildLifeNote, cleanLifeEvent, lifeEventDue, newcomerDue, pickLifeSubject } from "./worldLife";
import { Character } from "../../types";

const DAY = 24 * 60 * 60 * 1000;
const c = (id: number, extra: Partial<Character> = {}) => ({ id, name: `C${id}`, ...extra }) as Character;

test("life events and newcomers come after their gaps, on a good roll", () => {
  expect(lifeEventDue({ lastLifeAt: 0 }, 4 * DAY, 3 * DAY, () => 0)).toBe(true);
  expect(lifeEventDue({ lastLifeAt: 2 * DAY }, 4 * DAY, 3 * DAY, () => 0)).toBe(false);
  expect(newcomerDue({}, 3, 11 * DAY, 10 * DAY, () => 0)).toBe(true);
  expect(newcomerDue({}, 1, 11 * DAY, 10 * DAY, () => 0)).toBe(false);
  expect(newcomerDue({ newcomer: { name: "X", idea: "y", at: 0 } }, 3, 11 * DAY, 10 * DAY, () => 0)).toBe(false);
});

test("someone it just happened to is passed over", () => {
  const now = 10 * DAY;
  const cast = [c(1, { lifeEvents: [{ text: "x", at: now - DAY }] }), c(2)];
  expect(pickLifeSubject(cast, now, () => 0)!.id).toBe(2);
  expect(pickLifeSubject([cast[0]], now, () => 0)!.id).toBe(1);
});

test("a life event is kept, and their prompt hears about recent ones", () => {
  const now = 30 * DAY;
  let ch = c(1);
  ch = addLifeEvent(ch, "Old news.", 0);
  ch = addLifeEvent(ch, "Got a job at the docks.", now - 2 * DAY);
  const note = buildLifeNote(ch, now)!;
  expect(note).toContain("- Got a job at the docks. (2 days ago)");
  expect(note).not.toContain("Old news");
  expect(buildLifeNote(c(2), now)).toBeUndefined();
  expect(cleanLifeEvent('"Mara moved to the north coast."\nextra')).toBe("Mara moved to the north coast.");
  expect(cleanLifeEvent("ok")).toBeUndefined();
});

test("a long gap writes each life and the ties that changed (#180)", () => {
  const { parseGapLives, buildGapLivesPrompt } = require("./worldLife");
  const cast = [c(1, { name: "Aria" }), c(2, { name: "Kai Vale", ties: [{ withId: 1, tie: "your friend" }] })] as Character[];
  const prompt = buildGapLivesPrompt({ name: "Harbour", premise: "A port." }, "3 years", "a war", cast, true);
  expect(prompt).toContain("3 years have just passed there (meanwhile: a war).");
  expect(prompt).toContain("(Aria: friend)");
  expect(prompt).toContain("TIE: <name>");
  expect(buildGapLivesPrompt({ name: "H", premise: "p" }, "2 weeks", undefined, cast, false)).not.toContain("TIE:");
  const { lives, ties } = parseGapLives("LIFE: Aria | Aria opened a bakery by the pier.\n**LIFE: Kai | Kai married Mira.**\nLIFE: Nobody | x happened here.\nTIE: Aria | Kai | your ex | your ex", cast);
  expect(lives).toEqual([{ id: 1, text: "Aria opened a bakery by the pier." }, { id: 2, text: "Kai married Mira." }]);
  expect(ties).toEqual([{ a: 1, b: 2, bToA: "your ex", aToB: "your ex" }]);
});
