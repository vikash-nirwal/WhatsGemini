import { buildFactionNote, parseFactions } from "./factions";
import { Character } from "../../types";

const cast = [{ id: 1, name: "Aria Vale" }, { id: 2, name: "Kai Vale" }, { id: 3, name: "Cleo" }] as Character[];

test("groups are read leniently; fewer than two known members is skipped", () => {
  const groups = parseFactions("GROUP: The Vales | family | Aria, Kai Vale | Old fishing family\n**GROUP: Night crew | faction | Cleo, Nobody**\nGROUP: Dockers | crew | Kai, Cleo", cast);
  expect(groups.map((g) => [g.name, g.kind, g.memberIds])).toEqual([["The Vales", "family", [1, 2]], ["Dockers", "faction", [2, 3]]]);
  expect(groups[0].about).toBe("Old fishing family");
});

test("a member's prompt hears who they belong with", () => {
  const world = { factions: [{ id: "a", name: "The Vales", kind: "family" as const, memberIds: [1, 2], about: "Old fishing family" }, { id: "b", name: "Dockers", kind: "faction" as const, memberIds: [3, 2] }] };
  const note = buildFactionNote(cast[0], world, cast)!;
  expect(note).toContain("You belong to the family The Vales (Old fishing family), with Kai Vale. You're loyal to them");
  expect(note).toContain("Other groups here: Dockers");
  expect(buildFactionNote({ id: 9, name: "X" } as Character, world, cast)).toBeUndefined();
});
