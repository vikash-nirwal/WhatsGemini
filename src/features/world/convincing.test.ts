import { addExtras, extrasLine, parsePeople } from "./extras";
import { addCanon, bringsBackGone, canonLine, canonOf, isGone, worldContext } from "./canon";
import { addPlaceState, aftermathDue, buildAftermathPrompt, parseAftermath } from "./aftermath";
import { heldAgain, seasonOf, traditionDue, traditionFrom } from "./rhythm";
import { paceFactor, talkativeness } from "./activity";
import { buildGoalPrompt, clashLine, cleanGoal, goalsClash, parseGoalAgainst } from "./goals";
import { buildSceneNow } from "./sceneNow";
import { saveWorldPrefs } from "./worldPrefs";
import { Character, World, WorldEvent } from "../../types";
import type { TimelineEntry } from "./timeline";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 27, 12).getTime();
const aria = { id: 1, name: "Aria Vale", prompt: "A sailor.", worldId: 5 } as Character;
const kai = { id: 2, name: "Kai", prompt: "A baker.", worldId: 5 } as Character;
const pins = [{ id: "docks", name: "Docks", x: 0, y: 0 }, { id: "inn", name: "Inn", x: 1, y: 1 }];
const world = { id: 5, name: "Harbour Town", premise: "A rainy port.", map: { image: "x", pins } } as unknown as World;

afterEach(() => localStorage.clear());

describe("background people (#218)", () => {
  it("reads PERSON lines and keeps new names only, tied to whoever they belong to", () => {
    const found = parsePeople("Kai: hey\nPERSON: Tom | the harbour master | Kai's boss\nPERSON: Aria | already a character | \nPERSON: x1 | bad name |");
    expect(found).toEqual([{ name: "Tom", about: "the harbour master", whose: "Kai's boss" }, { name: "Aria", about: "already a character" }]);
    const list = addExtras(undefined, found, [aria, kai], NOW);
    expect(list).toEqual([{ name: "Tom", about: "the harbour master", tiedTo: 2, at: NOW }]);
    expect(addExtras(list, [{ name: "tom", about: "again" }], [aria, kai], NOW)).toHaveLength(1);
  });

  it("prompts name the ones who belong to the people in it first", () => {
    const w = { extras: [{ name: "Old Meg", about: "the fishwife", at: NOW }, { name: "Tom", about: "the harbour master", tiedTo: 2, at: NOW - DAY }] };
    expect(extrasLine(w, [kai], [aria, kai])).toBe("People around here who aren't in this (bring them back by name rather than inventing new people): Tom - the harbour master (Kai's); Old Meg - the fishwife.");
    expect(extrasLine({}, [kai], [aria, kai])).toBeUndefined();
  });
});

describe("events with consequences (#219)", () => {
  const storm = { id: "ev-1", title: "The Long Storm", text: "A gale kept every boat in.", at: NOW - 4 * DAY, endsAt: NOW - DAY } as WorldEvent;

  it("an event that ended lately is due its aftermath, once", () => {
    expect(aftermathDue({ events: [storm] }, NOW)).toBe(storm);
    expect(aftermathDue({ events: [{ ...storm, aftermathAt: NOW }] }, NOW)).toBeUndefined();
    expect(aftermathDue({ events: [{ ...storm, endsAt: NOW + DAY }] }, NOW)).toBeUndefined();
    expect(aftermathDue({ events: [{ ...storm, endsAt: NOW - 20 * DAY }] }, NOW)).toBeUndefined();
  });

  it("reads a place's state, a lasting fact, a life turn and whether it comes back", () => {
    expect(buildAftermathPrompt(world, storm, ["Kai"], pins)).toContain("PLACE: <one of the places above>");
    const after = parseAftermath("PLACE: the Docks | closed for repairs | 5\nFACT: The old pier is gone for good.\nLIFE: Kai | Kai lost his stall in the storm.\nTRADITION: no", [aria, kai], pins, NOW);
    expect(after).toEqual({ tradition: false, place: { pinId: "docks", text: "closed for repairs", until: NOW + 5 * DAY }, fact: "The old pier is gone for good.", life: { who: kai, text: "Kai lost his stall in the storm." } });
    expect(parseAftermath("PLACE: the Moon | gone | 2\nTRADITION: yes", [kai], pins, NOW)).toEqual({ tradition: true });
  });

  it("a place's state shows in the time-and-place line while it lasts", () => {
    const w = { ...world, placeStates: addPlaceState(undefined, { pinId: "docks", text: "closed for repairs", until: NOW + DAY }, NOW) };
    expect(buildSceneNow(w, [kai], NOW)).toContain("Around here: Docks is closed for repairs.");
    expect(buildSceneNow(w, [kai], NOW + 2 * DAY)).not.toContain("Around here");
  });
});

describe("canon (#220)", () => {
  const bram = { id: 3, name: "Bram", prompt: "x", worldId: 5, lifeEvents: [{ text: "Bram died in the storm.", at: NOW - DAY }] } as Character;
  const wed = { ...kai, lifeEvents: [{ text: "Kai married Mara by the sea.", at: NOW - DAY }, { text: "Kai repainted his stall.", at: NOW }] };

  it("settled facts: departures, big life turns and lasting facts", () => {
    const timeline = [{ id: "t", at: NOW, kind: "departure", text: "Old Sal left Harbour Town" }] as TimelineEntry[];
    const facts = canonOf({ canon: addCanon(undefined, "The old pier is gone for good.") }, [wed, bram], timeline);
    expect(facts).toEqual(["Old Sal left Harbour Town", "Kai married Mara by the sea.", "Bram died in the storm.", "The old pier is gone for good."]);
    expect(canonLine(facts)).toMatch(/^Settled in this world \(never contradict it\): Old Sal left/);
    expect(worldContext(world, [], [wed], [])).toEqual(["Settled in this world (never contradict it): Kai married Mara by the sea."]);
  });

  it("the dead are gone, and text that puts them back on stage is caught", () => {
    expect(isGone(bram)).toBe(true);
    expect(isGone(kai)).toBe(false);
    expect(bringsBackGone("Bram waved from the boat.", [bram])).toBe(true);
    expect(bringsBackGone("They lit a candle and remembered Bram.", [bram])).toBe(false);
    expect(bringsBackGone("Brambles grew over the path.", [bram])).toBe(false);
  });
});

describe("goals that collide (#221)", () => {
  it("a new goal hears what others want and can name whose it works against", () => {
    const prompt = buildGoalPrompt(aria, "Harbour Town", undefined, [{ name: "Kai", goal: "Kai wants the corner stall." }]);
    expect(prompt).toContain("What others here want this week: Kai: Kai wants the corner stall.");
    expect(prompt).toContain("AGAINST: <their name>");
    const reply = "Aria wants the corner stall for her nets.\nAGAINST: Kai";
    expect(cleanGoal(reply)).toBe("Aria wants the corner stall for her nets.");
    expect(parseGoalAgainst(reply, [kai])).toBe(2);
    expect(parseGoalAgainst("Aria wants a new boat.", [kai])).toBeUndefined();
  });

  it("clashing goals are on both their minds", () => {
    const a = { ...aria, goal: { text: "the stall", setAt: NOW, against: 2 } };
    expect(goalsClash(a, kai)).toBe(true);
    expect(goalsClash(kai, a)).toBe(true);
    expect(clashLine(a, kai)).toContain("pulls against each other");
    expect(clashLine(aria, kai)).toBeUndefined();
  });
});

describe("a year with a rhythm (#222)", () => {
  it("the season, on the real calendar or the world's own", () => {
    expect(seasonOf(undefined, new Date(2026, 9, 27).getTime())).toBe("autumn");
    expect(seasonOf(undefined, new Date(2026, 10, 25).getTime())).toBe("late autumn");
    expect(seasonOf(undefined, new Date(2026, 0, 15).getTime())).toBe("winter");
    expect(seasonOf(undefined, new Date(2026, 2, 5).getTime())).toBe("early spring");
    const own = { storyTime: { year: 300, months: ["Thaw", "Bloom", "Sun", "Harvest"], daysPerMonth: 10, day: 0, anchorAt: NOW, moves: false } };
    // Four months: the first one opens in winter, as January does.
    expect(seasonOf(own, NOW)).toBe("winter");
    expect(buildSceneNow(undefined, [], NOW)).toContain("afternoon, autumn.");
  });

  it("an event becomes a tradition that comes back on its day, once a year", () => {
    const fest = { id: "ev-9", title: "Lantern Night", text: "Lanterns on the water.", at: new Date(2025, 9, 26).getTime(), endsAt: new Date(2025, 9, 28).getTime() } as WorldEvent;
    const t = traditionFrom({}, fest);
    expect(t).toMatchObject({ title: "Lantern Night", month: 9, day: 26, days: 2, lastYear: 2025 });
    expect(traditionDue({ traditions: [t] }, NOW)).toBe(t);
    expect(traditionDue({ traditions: [{ ...t, lastYear: 2026 }] }, NOW)).toBeUndefined();
    expect(traditionDue({ traditions: [t] }, new Date(2026, 9, 10).getTime())).toBeUndefined();
    expect(heldAgain(t, "ev-10", NOW)).toEqual({ id: "ev-10", title: "Lantern Night", text: "Lanterns on the water. As every year.", at: NOW, endsAt: NOW + 2 * DAY });
  });
});

describe("uneven activity (#223)", () => {
  it("chatty people talk more, quiet ones less, and a hard week makes them withdraw", () => {
    expect(talkativeness({ description: "A chatty barmaid." }, NOW)).toBe(1.5);
    expect(talkativeness({ prompt: "Shy and reserved." }, NOW)).toBe(0.65);
    expect(talkativeness({}, NOW)).toBe(1);
    expect(talkativeness({ lifeEvents: [{ text: "Lost the job at the docks.", at: NOW - DAY }] }, NOW)).toBe(0.6);
    expect(talkativeness({ lifeEvents: [{ text: "Got the job at the docks.", at: NOW - DAY }] }, NOW)).toBe(1.3);
    expect(paceFactor({}, {}, NOW)).toBe(1);
    expect(paceFactor({ description: "chatty" }, { description: "chatty" }, NOW)).toBeCloseTo(0.667, 2);
  });
});

test("the people switch travels and is off by default", () => {
  expect(worldContext({ ...world, extras: [{ name: "Tom", about: "x", at: NOW }] }, [], [kai], [])).toEqual([]);
  saveWorldPrefs(5, { extras: true });
  expect(worldContext({ ...world, extras: [{ name: "Tom", about: "x", at: NOW }] }, [], [kai], [])[0]).toContain("Tom - x");
});
