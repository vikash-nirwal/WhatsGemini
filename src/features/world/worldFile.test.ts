import { exportWorld, readWorldFile, relink, worldFileName } from "./worldFile";
import { Character, World } from "../../types";

const world = { id: 7, name: "Harbour Town", premise: "A port.", coverImage: "local:abc", reputation: { text: "x", at: 1 }, factions: [{ id: "f", name: "The Vales", kind: "family", memberIds: [1, 2], chatId: 9 }] } as World;
const aria = { id: 1, name: "Aria", prompt: "You are Aria.", avatar: "local:img", gallery: ["data:image/png;base64,x", "local:y"], memory: ["secret"], worldId: 7, ties: [{ withId: 2, tie: "your brother" }, { withId: 99, tie: "your ex" }] } as unknown as Character;
const kai = { id: 2, name: "Kai", prompt: "You are Kai.", ties: [{ withId: 1, tie: "your sister" }] } as Character;

test("a world file keeps the world as written, not what they lived or this device's pictures", () => {
  const file = exportWorld(world, [aria, kai]);
  expect(file.world).toEqual({ name: "Harbour Town", premise: "A port.", factions: [{ id: "f", name: "The Vales", kind: "family", memberIds: [1, 2] }] });
  expect(file.cast[0]).toEqual({ name: "Aria", prompt: "You are Aria.", gallery: ["data:image/png;base64,x"], key: 1 });
  expect(file.ties).toEqual([{ a: 1, b: 2, tie: "your brother" }, { a: 2, b: 1, tie: "your sister" }]);
});

test("reading checks it's a world; ties and groups move to the new ids", () => {
  const file = readWorldFile(JSON.stringify(exportWorld(world, [aria, kai])));
  expect(() => readWorldFile('{"kind":"other"}')).toThrow("That file isn't a world.");
  const { ties, factions } = relink(file, { 1: 11, 2: 12 });
  expect(ties).toEqual({ 11: [{ withId: 12, tie: "your brother" }], 12: [{ withId: 11, tie: "your sister" }] });
  expect(factions[0].memberIds).toEqual([11, 12]);
  expect(worldFileName("Harbour Town!")).toBe("harbour-town.world.json");
});
