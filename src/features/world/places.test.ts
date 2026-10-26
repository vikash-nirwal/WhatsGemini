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
