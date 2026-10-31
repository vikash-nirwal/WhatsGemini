import { adventureKey, characterKey, chatKey, indexBy, worldKey } from "./restoreMatch";
import { Chat, Character } from "../types";

describe("matching a restore against what's here", () => {
  it("knows a world, a person and a chat that are already here", () => {
    expect(worldKey({ name: "Harbour  Town", premise: "A rainy port." })).toBe(worldKey({ name: "harbour town", premise: "A rainy port. " }));
    const aria = { name: "Aria", prompt: "Warm.", description: "", worldId: 3 } as Character;
    expect(characterKey(aria)).toBe(characterKey({ ...aria, name: "aria " }));
    expect(characterKey(aria)).not.toBe(characterKey({ ...aria, worldId: 4 }));
    const chat = { characterIds: [2, 1], content: [{ id: "m1" }, { id: "m2" }] } as unknown as Chat;
    expect(chatKey(chat)).toBe(chatKey({ characterIds: [1, 2], content: [{ id: "m1" }] } as unknown as Chat));
    expect(chatKey({ characterIds: [1], content: [] } as unknown as Chat)).toBeUndefined();
    expect(adventureKey({ title: "The Vault", content: [{ id: "a1" }] })).toBe(adventureKey({ title: "the vault", content: [{ id: "a1" }, { id: "a2" }] }));
  });

  it("indexes the first of each", () => {
    expect(Array.from(indexBy([{ id: 1, k: "a" }, { id: 2, k: "a" }, { id: 3, k: "b" }], (r) => r.k))).toEqual([["a", 1], ["b", 3]]);
  });
});
