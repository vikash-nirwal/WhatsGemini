import { Character, World } from "../../types";
import { buildCanonNote, buildInnerStateNote, buildWorldNowNote } from "./worldNow";

const NOW = new Date(2026, 3, 10, 12).getTime();
const DAY = 86_400_000;
const world: World = { id: 4, name: "Harbor Town", premise: "A fishing town.", map: { image: "", pins: [{ id: "p1", name: "the market", x: 0, y: 0 }] }, placeStates: [{ pinId: "p1", text: "flooded", until: NOW + DAY }] };
const char = (id: number, name: string, extra: Partial<Character> = {}): Character => ({ id, name, description: "", prompt: "", worldId: 4, ...extra });

describe("the world as it is now, for replies to you", () => {
  it("names what's settled, including a death in someone else's life", () => {
    const mara = char(2, "Mara", { lifeEvents: [{ text: "Mara's father passed away.", at: NOW - 14 * DAY }] });
    expect(buildCanonNote(world, [char(1, "Aria"), mara], [])).toContain("Mara's father passed away");
    expect(buildCanonNote(undefined, [mara], [])).toBeUndefined();
  });

  it("gives the season and how places are", () => {
    const note = buildWorldNowNote(world, NOW)!;
    expect(note).toMatch(/In Harbor Town it's (early |late )?spring/);
    expect(note).toContain("the market is flooded");
    expect(buildWorldNowNote(world, NOW + 2 * DAY)).not.toContain("flooded");
  });

  it("brings their mood and charged bonds, with the reasons", () => {
    const aria = char(1, "Aria", {
      mood: { value: -50, at: NOW, why: "lost the boat race" },
      bonds: [{ withId: 2, closeness: 10, tension: 70, at: NOW, why: [{ text: "Kai took her spot on the crew", at: NOW }] }],
    });
    const note = buildInnerStateNote(aria, world, [aria, char(2, "Kai")], NOW)!;
    expect(note).toContain("a bit down (lost the boat race)");
    expect(note).toContain("With Kai things are very tense lately: Kai took her spot on the crew.");
    expect(buildInnerStateNote(char(1, "Aria"), world, [char(2, "Kai")], NOW)).toBeUndefined();
  });
});
