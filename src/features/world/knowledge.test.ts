import { applyShared, buildFoldPrompt, cleanFold, foldDue, FOLD_AT, markFolded, audienceOf, buildKnowsNote, buildShareSection, knowsEntry, knownTo, parseNewFact, parseShared } from "./knowledge";
import { buildSceneNow } from "./sceneNow";
import { buildHistoryNote, TimelineEntry } from "./timeline";
import { buildWorldTalkPrompt } from "./worldTalk";
import { buildTheirGroupPrompt } from "../chat/theirGroup";
import { Character } from "../../types";

const DAY = 86_400_000;
const NOW = 1_000_000_000_000;
const mara = { id: 1, name: "Mara", prompt: "x", spreadsRumors: true } as Character;
const jon = { id: 2, name: "Jon", prompt: "x" } as Character;
const eva = { id: 3, name: "Eva", prompt: "x" } as Character;
const cast = [mara, jon, eva];

const entry = (id: string, e: Partial<TimelineEntry>): TimelineEntry => ({ id, at: NOW - DAY / 2, kind: "event", text: id, ...e });

describe("the world's record (#203)", () => {
  it("reads older entries by kind: what everyone saw is public, the rest belongs to the people in it", () => {
    expect(audienceOf(entry("a", { kind: "arrival" }))).toBe("public");
    expect(audienceOf(entry("b", { kind: "tie" }))).toBe("private");
    expect(audienceOf(entry("c", { kind: "event", audience: "private" }))).toBe("private");
  });

  it("knows who knows: the people in it, those it names, and those who heard", () => {
    const breakup = entry("breakup", { kind: "tie", characterIds: [2, 3] });
    expect(knowsEntry(breakup, 2)).toBe(true);
    expect(knowsEntry(breakup, 1)).toBe(false);
    expect(knowsEntry({ ...breakup, heard: [{ id: 1, from: 2, at: NOW }] }, 1)).toBe(true);
    // Told you something about Jon and Eva: only the teller knows.
    const told = entry("told", { kind: "you", characterIds: [1, 2, 3], knownBy: [1] });
    expect(knowsEntry(told, 1)).toBe(true);
    expect(knowsEntry(told, 3)).toBe(false);
  });

  it("keeps the history note to what that character could know", () => {
    const list = [entry("Eva arrived", { kind: "arrival", at: NOW - 3 * DAY }), entry("You and Jon made a plan", { kind: "you", characterIds: [2], at: NOW - 3 * DAY })];
    expect(buildHistoryNote(list, NOW, 8, 2)).toContain("You and Jon made a plan");
    expect(buildHistoryNote(list, NOW, 8, 3)).not.toContain("You and Jon made a plan");
    expect(buildHistoryNote(list, NOW, 8, 3)).toContain("Eva arrived");
  });
});

describe("what each person knows (#204)", () => {
  const list = [
    entry("Market fire", { kind: "event", at: NOW - DAY }),
    entry("Old festival", { kind: "event", at: NOW - 10 * DAY }),
    entry("Jon and Eva broke up", { kind: "tie", characterIds: [2, 3], heard: [{ id: 1, from: 2, at: NOW }] }),
    entry("Eva is leaving town", { kind: "event", characterIds: [3], audience: "secret" }),
    entry("Folded away", { kind: "talk", characterIds: [1], folded: [1] }),
  ];

  it("gives recent public news and private things they were in or heard, not folded ones", () => {
    const mine = knownTo(1, list, NOW);
    expect(mine.map((i) => i.entry.text)).toEqual(["Market fire", "Jon and Eva broke up"]);
    expect(mine[1].from).toBe(2);
    expect(knownTo(3, list, NOW).find((i) => i.entry.id === "Eva is leaving town")?.secret).toBe(true);
  });

  it("writes their chat note with who told them, and secrets marked", () => {
    expect(buildKnowsNote(mara, list, cast, NOW)).toContain("(heard from Jon) Jon and Eva broke up");
    expect(buildKnowsNote(mara, list, cast, NOW)).not.toContain("Market fire");
    expect(buildKnowsNote(eva, list, cast, NOW)).toContain("(a secret: keep it) Eva is leaving town");
    expect(buildKnowsNote(jon, [], cast, NOW)).toBeUndefined();
  });
});

describe("hearsay (#206)", () => {
  const list = [
    entry("Jon and Eva broke up", { kind: "tie", characterIds: [2, 3], heard: [{ id: 1, from: 2, at: NOW }] }),
    entry("Jon got the job", { kind: "event", characterIds: [2], audience: "private" }),
    entry("Eva is leaving town", { kind: "event", characterIds: [3], audience: "secret" }),
  ];

  it("offers their own news, others' only through someone who talks, and never a secret", () => {
    // Jon can tell Eva his own news; Mara, a talker, could pass on the breakup.
    const share = buildShareSection([jon, eva], list, NOW);
    expect(share.items.map((s) => s.entryId)).toEqual(["Jon got the job"]);
    expect(share.text).toContain("[1] Jon knows: Jon got the job");
    expect(share.text).toContain("Eva keeps this to themselves: Eva is leaving town");
    const gossip = buildShareSection([mara, { ...eva, id: 4, name: "Ines" } as Character], list, NOW, cast);
    expect(gossip.text).toContain("Mara knows: (heard from Jon) Jon and Eva broke up");
    // Without "Talks about you", heard things stay put.
    const quiet = buildShareSection([{ ...mara, spreadsRumors: false } as Character, { ...eva, id: 4, name: "Ines" } as Character], list, NOW);
    expect(quiet.items).toEqual([]);
  });

  it("reads what was told and what came out, and records who heard it from whom", () => {
    const share = buildShareSection([jon, eva], list, NOW);
    const reply = "Jon: guess what\nEva: what\nJon: got the job!!\nSHARED: 1\nNEW: Jon and Eva plan to have drinks on Friday.";
    expect(parseShared(reply)).toEqual([1]);
    expect(parseShared("SHARED: none")).toEqual([]);
    expect(parseNewFact(reply)).toBe("Jon and Eva plan to have drinks on Friday.");
    expect(parseNewFact("NEW: none")).toBeUndefined();
    const after = applyShared(list, share.items, [1], [2, 3], NOW);
    expect(after[1].heard).toEqual([{ id: 3, from: 2, at: NOW }]);
    expect(knownTo(3, after, NOW).find((i) => i.entry.id === "Jon got the job")?.from).toBe(2);
    // Nothing told, nothing changes.
    expect(applyShared(list, share.items, [], [2, 3], NOW)).toBe(list);
  });

  it("asks talks to say what was passed on", () => {
    const share = buildShareSection([jon, eva], list, NOW);
    const talk = buildWorldTalkPrompt(jon, eva, { userName: "Sam", maxLines: 6, share, sceneNow: "Right now it's Tuesday evening." });
    expect(talk).toContain("[1] Jon knows: Jon got the job");
    expect(talk).toContain("SHARED:");
    expect(talk).toContain("NEW:");
    expect(talk).toContain("Right now it's Tuesday evening.");
    const group = buildTheirGroupPrompt([jon, eva], "Us", [], { limit: 6, userName: "Sam", share });
    expect(group).toContain("SHARED:");
  });

  it("keeps what you told someone private unless they talk", () => {
    const knows = { 1: { facts: ["Sam is moving"] }, 2: { facts: ["Sam got a dog"] } };
    const talk = buildWorldTalkPrompt(mara, jon, { userName: "Sam", maxLines: 6, topic: "user", knows });
    expect(talk).toContain("Jon doesn't pass on what Sam told them in private.");
    expect(talk).not.toContain("Mara doesn't pass on");
  });
});

describe("one time and place (#205)", () => {
  const evening = new Date(2026, 9, 27, 19, 30).getTime();
  const at = (name: string) => ({ start: 0, end: 24, activity: `at the ${name}` });

  it("tells every talk the same hour, and where each of them is", () => {
    const world = { map: { pins: [{ id: "c", name: "Café", x: 0, y: 0 }] } } as never;
    const a = { ...jon, schedule: { blocks: [at("Café")] } } as Character;
    const b = { ...eva, schedule: { blocks: [at("Café")] } } as Character;
    const line = buildSceneNow(world, [a, b], evening);
    expect(line).toContain("Tuesday evening");
    expect(line).toContain("Jon is at Café");
    expect(line).toContain("same place");
    expect(buildSceneNow(undefined, [jon, eva], evening)).toBe("Right now it's Tuesday evening. Keep to the hour and where they are.");
  });

  it("uses the world's own calendar when it keeps one", () => {
    const st = { yearLabel: "Year", year: 3, months: ["Frost"], daysPerMonth: 30, day: 4, anchorAt: evening, moves: true, start: { year: 3, day: 0 } };
    expect(buildSceneNow({ storyTime: st } as never, [jon], evening)).toContain("Year 3, Frost, day 5, evening");
  });
});

describe("memory condensing (#207)", () => {
  const many = Array.from({ length: FOLD_AT }, (_, i) => entry(`e${i}`, { kind: "talk", characterIds: [2], text: `thing ${i}`, at: NOW - (20 - i) * DAY }));

  it("folds the oldest once someone knows a lot, and the note keeps the gist", () => {
    expect(foldDue(2, many.slice(1), NOW)).toEqual([]);
    const due = foldDue(2, many, NOW);
    expect(due.map((e) => e.id)).toEqual(["e0", "e1", "e2", "e3", "e4", "e5"]);
    expect(buildFoldPrompt({ ...jon, knownSummary: "Old news." }, due, cast)).toContain("What they already remembered: Old news.");
    const folded = markFolded(many, due.map((e) => e.id), 2);
    expect(foldDue(2, folded, NOW)).toEqual([]);
    expect(knownTo(2, folded, NOW, { max: 20 }).map((i) => i.entry.id)).toEqual(["e6", "e7", "e8", "e9"]);
    expect(buildKnowsNote({ ...jon, knownSummary: "Jon knows the mill is closing." }, folded, cast, NOW)).toContain("- From before: Jon knows the mill is closing.");
    expect(cleanFold('"  ok "')).toBeUndefined();
  });
});
