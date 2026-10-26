import { placeScenario, whereIs, whoIsWhere } from "./places";
import { Character, MapPin } from "../../types";

const pins: MapPin[] = [{ id: "p1", name: "The Docks", x: 1, y: 1 }, { id: "p2", name: "Rosa's Café", x: 2, y: 2 }];
const at = (h: number) => new Date(2026, 9, 21, h, 0, 0).getTime();
const c = (id: number, extra: Partial<Character> = {}) => ({ id, name: `C${id}`, ...extra }) as Character;

test("the schedule's place on the map wins, then their usual spot", () => {
  const worker = c(1, { schedule: { blocks: [{ start: 8, end: 17, activity: "working at the docks" }] } as any, hangout: "p2" });
  expect(whereIs(worker, pins, at(10))!.id).toBe("p1");
  expect(whereIs(worker, pins, at(20))!.id).toBe("p2");
  expect(whereIs(c(2), pins, at(10))).toBeUndefined();
  expect(whoIsWhere([worker, c(2, { hangout: "p2" })], pins, at(20))).toEqual({ p2: [worker, expect.objectContaining({ id: 2 })] });
});

test("a scene at a place names who's there", () => {
  expect(placeScenario("The Docks", ["Aria", "Kai"], "Sam")).toBe("Sam comes by The Docks. Aria, Kai are there. The scene starts there and then.");
  expect(placeScenario("The Docks", [], "Sam")).toBe("Sam comes by The Docks. The scene starts there and then.");
});

test("everyone without a usual spot gets one from the map (#177)", () => {
  const { hangoutsDue, parseHangouts, buildHangoutsPrompt } = require("./places");
  const people = [c(1, { name: "Aria" }), c(2, { name: "Kai Vale" }), c(3, { hangout: "p1" })];
  const world = { map: { pins } };
  expect(hangoutsDue(world, people, 2 * 86_400_000)).toBe(true);
  expect(hangoutsDue({ ...world, lastHangoutsAt: 86_400_000 }, people, 1.5 * 86_400_000)).toBe(false);
  expect(hangoutsDue(world, [c(3, { hangout: "p1" })], 2 * 86_400_000)).toBe(false);
  expect(hangoutsDue({}, people, 2 * 86_400_000)).toBe(false);
  expect(buildHangoutsPrompt("Harbour", pins, [people[0]])).toContain("Places in Harbour: The Docks, Rosa's Café.");
  expect(parseHangouts("- Aria | the docks\n**Kai | Rosa's Café**\nNobody | The Docks\nAria2 | Moon", people, pins)).toEqual({ 1: "p1", 2: "p2" });
});

test("where you are fades after a few hours, and someone there knows (#183)", () => {
  const { whereYouAre, buildYouAtNote, runInDue } = require("./places");
  const HOUR = 3_600_000;
  const world = { youAt: { pinId: "p1", at: 0 }, map: { pins } };
  expect(whereYouAre(world, 2 * HOUR)!.name).toBe("The Docks");
  expect(whereYouAre(world, 7 * HOUR)).toBeUndefined();
  expect(buildYouAtNote(pins[0], pins[0], "Sam")).toBe("Sam is at The Docks right now. So are you - you might run into each other.");
  expect(buildYouAtNote(pins[0], pins[1], "Sam")).toBe("Sam is at The Docks right now.");
  expect(runInDue({ lastRunInAt: 0 }, 2 * HOUR)).toBe(false);
});
