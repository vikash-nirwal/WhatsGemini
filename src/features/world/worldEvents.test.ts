import { activeEvents, addEvent, buildEventIdeaPrompt, buildEventsNote, endEvent, eventDue, parseEvent } from "./worldEvents";
import { WorldEvent } from "../../types";

const DAY = 24 * 60 * 60 * 1000;
const ev = (at: number, days: number, title = "Harvest fair"): WorldEvent => ({ id: `e${at}`, title, text: "Stalls in the square.", at, endsAt: at + days * DAY });

test("only events under way count as active", () => {
  const now = 10 * DAY;
  expect(activeEvents({ events: [ev(0, 2), ev(9 * DAY, 3, "Storm"), ev(11 * DAY, 1, "Later")] }, now).map((e) => e.title)).toEqual(["Storm"]);
  expect(activeEvents(undefined, now)).toEqual([]);
});

test("ending an event closes it now; the list keeps the newest 20", () => {
  const ended = endEvent([ev(0, 5)], "e0", DAY);
  expect(ended[0].endsAt).toBe(DAY);
  let list: WorldEvent[] = [];
  for (let i = 0; i < 25; i++) list = addEvent(list, ev(i, 1));
  expect(list).toHaveLength(20);
  expect(list[19].at).toBe(24);
});

test("the world starts its own event only after a quiet gap, and on a good roll", () => {
  const now = 20 * DAY;
  expect(eventDue({ events: [ev(19 * DAY, 3)] }, now, 4 * DAY, () => 0)).toBe(false); // one is on
  expect(eventDue({ events: [ev(14 * DAY, 3)] }, now, 4 * DAY, () => 0)).toBe(false); // ended 3 days ago
  expect(eventDue({ events: [ev(10 * DAY, 3)] }, now, 4 * DAY, () => 0)).toBe(true);
  expect(eventDue({ events: [ev(10 * DAY, 3)] }, now, 4 * DAY, () => 0.9)).toBe(false);
  expect(eventDue({ lastEventCheckAt: now - DAY }, now, 4 * DAY, () => 0)).toBe(false);
});

test("an event reply is read leniently, with its length clamped", () => {
  const e = parseEvent('Sure!\n**TITLE: "The Great Flood"\n- WHAT: The river burst its banks overnight.\nDAYS: about 30', 1000, true)!;
  expect(e.title).toBe("The Great Flood");
  expect(e.text).toBe("The river burst its banks overnight.");
  expect(e.endsAt - e.at).toBe(14 * DAY);
  expect(e.byYou).toBe(true);
  expect(parseEvent("TITLE: x", 0)).toBeUndefined();
  expect(parseEvent("TITLE: Fair\nWHAT: Fun.", 0)!.endsAt).toBe(3 * DAY);
});

test("prompts carry the author's idea and the events in play", () => {
  const prompt = buildEventIdeaPrompt({ name: "Larkhaven", premise: "A harbour town." }, ["Aria"], [ev(0, 1)], "a ship sinks");
  expect(prompt).toContain("The author wants this to happen: a ship sinks");
  expect(prompt).toContain("Earlier events (something different this time): Harvest fair");
  expect(buildEventsNote([ev(0, 1)])).toContain("- Harvest fair: Stalls in the square.");
  expect(buildEventsNote([])).toBeUndefined();
});
