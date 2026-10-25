import { cardChanged, linkedCopies, resetCharacter, rootOf, withCard, worldCopy } from "./card";
import { Character } from "../../types";

const aria = {
  id: 1, name: "Aria", description: "Mechanic", prompt: "You are Aria.", appearance: "red hair", textsFirst: true,
  relationship: "Close friend", relationshipHistory: [{ from: "New Friend", to: "Close friend", at: 5 }],
  memory: ["You like tea"], memoryStanding: { text: "Warm.", at: 1 }, statuses: [], diary: [], gifts: [], dayMood: { date: "2026-10-25", mood: "tired" },
} as unknown as Character;

describe("character card (#143, #158)", () => {
  it("a world copy keeps the card and the starting relationship, nothing else", () => {
    const copy = worldCopy(aria, 7);
    expect(copy).toEqual({ name: "Aria", description: "Mechanic", prompt: "You are Aria.", appearance: "red hair", textsFirst: true, relationship: "New Friend", worldId: 7, cardOf: 1 });
    expect(worldCopy(aria, null)).not.toHaveProperty("worldId");
  });

  it("reset clears what built up and keeps the card, the world and the link", () => {
    const reset = resetCharacter({ ...aria, worldId: 7, cardOf: 3 });
    expect(reset).toEqual({ id: 1, name: "Aria", description: "Mechanic", prompt: "You are Aria.", appearance: "red hair", textsFirst: true, relationship: "New Friend", worldId: 7, cardOf: 3 });
  });

  it("finds copies through the original, and card edits reach them without their memories", () => {
    const copy = { ...worldCopy(aria, 7), id: 2, memory: ["Met at the harbour"] } as Character;
    const other = { id: 3, name: "Kai", prompt: "x" } as Character;
    expect(rootOf(copy)).toBe(1);
    expect(linkedCopies([aria, copy, other], aria)).toEqual([copy]);
    expect(linkedCopies([aria, copy, other], copy)).toEqual([aria]);

    const edited = { ...aria, appearance: "short red hair", textsFirst: undefined };
    expect(cardChanged(aria, edited)).toBe(true);
    expect(cardChanged(aria, { ...aria, memory: ["new"] })).toBe(false);
    const synced = withCard(copy, edited);
    expect(synced.appearance).toBe("short red hair");
    expect(synced).not.toHaveProperty("textsFirst");
    expect(synced.memory).toEqual(["Met at the harbour"]);
    expect(synced.worldId).toBe(7);
  });
});
