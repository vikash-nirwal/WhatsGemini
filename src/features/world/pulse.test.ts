import { pulseItems } from "./pulse";
import { TimelineEntry } from "./timeline";

const HOUR = 3_600_000;
const now = 100 * HOUR;
const timeline: TimelineEntry[] = [
  { id: "a", at: now - 2 * HOUR, kind: "event", text: "Fog Week began" },
  { id: "b", at: now - 30 * HOUR, kind: "arrival", text: "Mira arrived" },
  { id: "c", at: now - HOUR, kind: "talk", text: "Aria and Kai talked about you", characterIds: [1, 2] },
];
const characters = [
  { id: 1, name: "Aria", talks: [{ id: "t1", withId: 2, at: now - HOUR, lines: [{ speakerId: 1, text: "hi" }] }, { id: "t2", withId: 3, at: now - 3 * HOUR, lines: [{ speakerId: 1, text: "yo" }] }] },
  { id: 2, name: "Kai" },
  { id: 3, name: "Cleo" },
] as any;

test("the last day's happenings, newest first, without repeating a talk about you", () => {
  const items = pulseItems(timeline, characters, { now, peek: true, worldId: 4 });
  expect(items.map((i) => i.text)).toEqual(["Aria and Kai talked about you", "Fog Week began", "Aria and Cleo texted"]);
  expect(items[2].to).toBe("/peek/1/3");
  expect(items[1].to).toBe("/worlds/4/timeline");
});

test("without Peek, their texts are mentioned but not opened", () => {
  const items = pulseItems([], characters, { now, peek: false, worldId: null });
  expect(items.map((i) => i.text)).toEqual(["Aria and Kai texted (turn on Peek to read)", "Aria and Cleo texted (turn on Peek to read)"]);
  expect(items[0].to).toBeUndefined();
});
