import { resetCharacter, worldCopy } from "./card";
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
});
