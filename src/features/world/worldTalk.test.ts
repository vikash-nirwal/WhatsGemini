import { addWorldTalk, buildWorldTalkPrompt, knowEachOther, pickWorldTalk, talksBetween, worldTalkNoteFor, worldThreads, WORLD_TALK_GAP_MS } from "./worldTalk";
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
