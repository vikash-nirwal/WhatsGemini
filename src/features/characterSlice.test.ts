import { configureStore } from "@reduxjs/toolkit";
import characterReducer, { addCharacter, patchCharacter } from "./characterSlice";
import { dbService } from "../services/dbService";
import { Character } from "../types";

jest.mock("../services/dbService", () => ({
  dbService: { addCharacter: jest.fn(), getCharacterById: jest.fn(), updateCharacter: jest.fn() },
}));

const makeStore = () => configureStore({ reducer: { character: characterReducer } });

describe("addCharacter", () => {
  // Set per test: CRA's Jest config resets mock implementations between tests.
  beforeEach(() => (dbService.addCharacter as jest.Mock).mockResolvedValue(7));

  // It used to copy a fixed list of fields, which dropped everything added
  // to Character since (greetings, rating, locked look...) on create.
  it("saves every field it's given", async () => {
    const character: Omit<Character, "id"> = {
      name: "Barnaby",
      description: "A cook.",
      prompt: "You are Barnaby.",
      alternateGreetings: ["Ahoy."],
      contentRating: "sfw",
      visualTags: "fifties, grey beard",
      postHistoryInstructions: "Stay grumpy.",
      voice: { rate: 1.2 },
    };
    const result = await makeStore().dispatch(addCharacter(character)).unwrap();
    expect(dbService.addCharacter).toHaveBeenCalledWith(character);
    expect(result).toEqual({ id: 7, ...character });
  });

  it("drops an id that came along, so the database assigns one", async () => {
    const withId = { id: 3, name: "Barnaby", description: "", prompt: "You are Barnaby." } as Character;
    await makeStore().dispatch(addCharacter(withId)).unwrap();
    expect(dbService.addCharacter).toHaveBeenCalledWith({ name: "Barnaby", description: "", prompt: "You are Barnaby." });
  });

  it("still requires a name and a prompt", async () => {
    await expect(makeStore().dispatch(addCharacter({ name: " ", description: "", prompt: "x" })).unwrap()).rejects.toMatch(/required/);
    expect(dbService.addCharacter).not.toHaveBeenCalled();
  });
});

describe("patchCharacter (#210)", () => {
  it("changes only what it's given, on the latest record, one patch at a time", async () => {
    // A tiny database: each read is slow, so two patches started together
    // would both read the same record if they weren't queued.
    let stored = { id: 3, name: "Aria", prompt: "x", memory: ["likes tea"] } as Character;
    (dbService.getCharacterById as jest.Mock).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return stored;
    });
    (dbService.updateCharacter as jest.Mock).mockImplementation(async (c: Character) => {
      stored = c;
      return c.id;
    });
    const store = makeStore();
    await Promise.all([
      store.dispatch(patchCharacter(3, (c) => ({ memory: [...(c.memory || []), "has a cat"] })) as any),
      store.dispatch(patchCharacter(3, { dayLog: { date: "2026-10-27", text: "Baked bread.", writtenAt: 1 } }) as any),
    ]);
    expect(stored.memory).toEqual(["likes tea", "has a cat"]);
    expect(stored.dayLog?.text).toBe("Baked bread.");
    expect(stored.name).toBe("Aria");
  });
});
