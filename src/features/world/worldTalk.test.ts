import { addWorldTalk, buildWorldTalkPrompt, pickTalkTopic, recencyOf, knowEachOther, pickWorldTalk, talksBetween, worldTalkNoteFor, worldThreads, WORLD_TALK_GAP_MS } from "./worldTalk";
import { loadWorldPrefs, saveWorldPrefs, talkLengthFor } from "./worldPrefs";
import { Character, World } from "../../types";

const worlds = [{ id: 5, name: "Harbour Town", premise: "A rainy port." }] as World[];
const NOW = 1_000_000_000_000;
const aria = { id: 1, name: "Aria", prompt: "x", knowsAbout: [2] } as Character;
const kai = { id: 2, name: "Kai", prompt: "x" } as Character;
const mara = { id: 3, name: "Mara", prompt: "x" } as Character;
const bram = { id: 4, name: "Bram", prompt: "x", worldId: 5, ties: [{ withId: 1, tie: "your uncle" }] } as Character;

describe("life inside a world (#145)", () => {
  it("only people who know each other, in the same world, talk", () => {
    expect(knowEachOther(aria, kai)).toBe(true);
    expect(knowEachOther(kai, mara)).toBe(false);
    expect(knowEachOther(aria, bram)).toBe(true);
    expect(pickWorldTalk([aria, kai, mara, bram], worlds, NOW)).toEqual([aria, kai]);
    // Bram's tie to Aria doesn't cross worlds.
    expect(pickWorldTalk([mara, bram, aria], worlds, NOW)).toBeUndefined();
  });

  it("waits out the gap, skips sleepers and switched-off worlds, and picks the longest-quiet pair", () => {
    const talked = addWorldTalk(aria, { id: "t1", withId: 2, at: NOW - 1000, lines: [] });
    expect(pickWorldTalk([talked, kai], worlds, NOW)).toBeUndefined();
    expect(pickWorldTalk([talked, kai], worlds, NOW + WORLD_TALK_GAP_MS)).toEqual([talked, kai]);
    expect(pickWorldTalk([aria, kai], worlds, NOW, { awake: (c) => c.id !== 2 })).toBeUndefined();
    expect(pickWorldTalk([aria, kai], worlds, NOW, { worldAllowed: (id) => id !== null })).toBeUndefined();
    const withMara = { ...talked, knowsAbout: [2, 3] };
    expect(pickWorldTalk([withMara, kai, mara], worlds, NOW + WORLD_TALK_GAP_MS)).toEqual([withMara, mara]);
  });

  it("keeps a few talks on the lower id, lists threads and tells the next reply", () => {
    let holder = aria;
    for (let i = 0; i < 8; i++) holder = addWorldTalk(holder, { id: `t${i}`, withId: 2, at: NOW + i, lines: [{ speakerId: 2, text: `line ${i}` }] });
    expect(holder.talks).toHaveLength(6);
    expect(talksBetween([holder, kai], 2, 1)).toHaveLength(6);
    const threads = worldThreads([holder, kai, bram], worlds, null);
    expect(threads.map((t) => [t.a.name, t.b.name, t.talks.length])).toEqual([["Aria", "Kai", 6]]);
    expect(worldThreads([holder, kai], worlds, 5)).toEqual([]);
    expect(worldTalkNoteFor(kai, [holder, kai], NOW + 10)).toBe("Recently you texted Aria:\nKai: line 7\nIt's part of your life; bring it up only if it fits.");
    expect(worldTalkNoteFor(kai, [holder, kai], NOW + 3 * 86_400_000)).toBeUndefined();
  });

  it("asks for their own talk, up to the world's length, with their tie", () => {
    const prompt = buildWorldTalkPrompt(bram, aria, { world: worlds[0], userName: "Sam", maxLines: 6 });
    expect(prompt).toContain("live in Harbour Town: A rainy port.");
    expect(prompt).toContain("(Aria is Bram's uncle)");
    expect(prompt).toContain("2 to 6 short texts");
    expect(prompt).toContain("Sam isn't in it.");
  });

  it("keeps per-world switches, My world included", () => {
    expect(loadWorldPrefs(null)).toEqual({});
    saveWorldPrefs(null, { peek: true });
    saveWorldPrefs(5, { talkLength: 40 });
    expect(loadWorldPrefs(null)).toEqual({ peek: true });
    expect(talkLengthFor(5)).toBe(20);
    expect(talkLengthFor(null)).toBe(10);
  });
});

describe("worlds keep running (#146)", () => {
  it("the world on screen always lives; others unless switched off", () => {
    const { livingIn } = jest.requireActual("./worldPrefs");
    saveWorldPrefs(7, { keepLiving: false });
    expect(livingIn(7, null)).toBe(false);
    expect(livingIn(7, 7)).toBe(true);
    expect(livingIn(8, null)).toBe(true);
  });
});

describe("better talk between characters (#159)", () => {
  it("picks a topic each time, the user about three times in ten", () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      const t = pickTalkTopic({ hasTie: true, hasNews: true, hasPrevious: true }, () => (i + 0.5) / 100);
      counts[t] = (counts[t] || 0) + 1;
    }
    expect(counts.user).toBe(29);
    expect(Object.keys(counts).sort()).toEqual(["follow-up", "lives", "news", "plan", "tie", "user"]);
    // Only topics that make sense for this pair.
    expect(pickTalkTopic({ hasTie: false, hasNews: false, hasPrevious: false }, () => 0.99)).toBe("plan");
  });

  it("talk about the user is grounded in what each knows, and other talk leaves the user in passing", () => {
    const a = { id: 1, name: "Aria", prompt: "x", ties: [{ withId: 2, tie: "your brother" }] } as Character;
    const b = { id: 2, name: "Kai", prompt: "x" } as Character;
    const knows = { 1: { relationship: "Close friend", lastTalked: "today", facts: ["Sam hates mornings"] }, 2: { lastTalked: "not for weeks", facts: [] } };
    const aboutYou = buildWorldTalkPrompt(a, b, { userName: "Sam", maxLines: 8, topic: "user", knows });
    expect(aboutYou).toContain("This time they get onto Sam");
    expect(aboutYou).toContain("What Aria knows about Sam: Sam is their Close friend; they last talked today; they remember: Sam hates mornings.");
    expect(aboutYou).toContain("What Kai knows about Sam: they last talked not for weeks.");
    expect(aboutYou).toContain("a brother and who know each other this well");
    const lives = buildWorldTalkPrompt(a, b, { userName: "Sam", maxLines: 8, topic: "lives", knows });
    expect(lives).not.toContain("What Aria knows about Sam");
    expect(lives).toContain("Sam can come up in passing");
    expect(recencyOf(undefined, 0)).toBe("never one to one");
    expect(recencyOf(1, 3 * 86_400_000 + 1)).toBe("3 days ago");
  });
});

describe("relationships that drift (#163)", () => {
  const { parseTieChange, tieMayChange } = require("./worldTalk");
  test("a talk's TIE line is read; none means no change", () => {
    expect(parseTieChange("Aria: sorry\nBram: me too\n**TIE: your friend again | your friend again**")).toEqual({ bToA: "your friend again", aToB: "your friend again" });
    expect(parseTieChange("TIE: ex-girlfriend")).toEqual({ bToA: "ex-girlfriend", aToB: "ex-girlfriend" });
    expect(parseTieChange("Aria: hi\nBram: hi")).toBeUndefined();
  });
  test("talks about their tie may always change it; others now and then", () => {
    expect(tieMayChange("tie", () => 0.99)).toBe(true);
    expect(tieMayChange("lives", () => 0.99)).toBe(false);
    expect(tieMayChange("lives", () => 0.1)).toBe(true);
  });
});

test("people in the same made world know each other; in My world only by ties", () => {
  const { knowEachOther } = require("./worldTalk");
  expect(knowEachOther({ id: 1, name: "A", worldId: 3 }, { id: 2, name: "B", worldId: 3 })).toBe(true);
  expect(knowEachOther({ id: 1, name: "A" }, { id: 2, name: "B" })).toBe(false);
  expect(knowEachOther({ id: 1, name: "A", worldId: 3 }, { id: 2, name: "B", worldId: 4 })).toBe(false);
});

describe("strangers become friends (#181)", () => {
  const { becameFriends, buildWorldTalkPrompt } = require("./worldTalk");
  const talk = (id: string) => ({ id, withId: 2, at: 1, lines: [{ speakerId: 1, text: "hi" }] });
  test("untied neighbours talk as acquaintances", () => {
    const prompt = buildWorldTalkPrompt({ id: 1, name: "A", worldId: 3 }, { id: 2, name: "B", worldId: 3 }, { userName: "Sam", maxLines: 6 });
    expect(prompt).toContain("They only know each other a little");
  });
  test("three talks without a tie make them friends", () => {
    const a = { id: 1, name: "A", talks: [talk("1"), talk("2"), talk("3")] };
    const b = { id: 2, name: "B" };
    expect(becameFriends([a, b], a, b)).toBe(true);
    expect(becameFriends([{ ...a, talks: [talk("1")] }, b], { ...a, talks: [talk("1")] }, b)).toBe(false);
    expect(becameFriends([a, b], { ...a, ties: [{ withId: 2, tie: "your rival" }] }, b)).toBe(false);
  });
});

describe("families and factions drive talk (#185)", () => {
  const { buildWorldTalkPrompt, pickTalkTopic } = require("./worldTalk");
  test("people in groups can talk about them, loyal to their own", () => {
    expect(pickTalkTopic({ hasTie: false, hasNews: false, hasPrevious: false, hasGroups: true }, () => 0.99)).toBe("groups");
    const prompt = buildWorldTalkPrompt({ id: 1, name: "A" }, { id: 2, name: "B" }, { userName: "Sam", maxLines: 6, topic: "groups", groups: { 1: ["The Vales"], 2: ["Dockers"] } });
    expect(prompt).toContain("Belongs to: The Vales (loyal to their own)");
    expect(prompt).toContain("rivalry, a grudge, a deal");
    const same = buildWorldTalkPrompt({ id: 1, name: "A" }, { id: 2, name: "B" }, { userName: "Sam", maxLines: 6, topic: "groups", groups: { 1: ["The Vales"], 2: ["The Vales"] } });
    expect(same).toContain("Their own The Vales business");
  });
});
