import { planWorldDeletion } from "./deleteWorldPlan";
import { Character, Chat } from "../../types";

const c = (id: number, extra: Partial<Character> = {}) => ({ id, name: `P${id}`, ...extra } as Character);
const chat = (id: number, characterIds: number[], worldId?: number) => ({ id, title: `chat ${id}`, characterIds, worldId, content: [] } as unknown as Chat);

describe("deleting a world", () => {
  const characters = [c(1), c(2, { worldId: 9, cardOf: 1 }), c(3, { worldId: 9 }), c(4, { worldId: 9, cardOf: 8 }), c(5, { worldId: 7 })];
  const chats = [chat(10, [2], 9), chat(11, [3], 9), chat(12, [2, 3], 9), chat(13, [1])];

  it("takes its people with it, unless kept", () => {
    expect(planWorldDeletion(9, "Harbour", characters, chats, new Set()).remove).toEqual([2, 3, 4]);
    expect(planWorldDeletion(9, "Harbour", characters, chats, new Set([2])).remove).toEqual([3, 4]);
  });

  it("a kept copy whose original is in Default becomes its variant; anyone else just moves there", () => {
    const { keep } = planWorldDeletion(9, "Harbour", characters, chats, new Set([2, 3, 4]));
    expect(keep).toEqual([
      { id: 2, patch: { worldId: undefined, variantFrom: "Harbour" } },
      { id: 3, patch: { worldId: undefined } },
      { id: 4, patch: { worldId: undefined } }, // its original isn't in Default
    ]);
  });

  it("moves the chats someone kept is still in, naming a variant's own", () => {
    const { chats: moved } = planWorldDeletion(9, "Harbour", characters, chats, new Set([2]));
    expect(moved).toEqual([
      { id: 10, patch: { worldId: undefined, title: "P2 (Harbour)" } },
      { id: 12, patch: { worldId: undefined } },
    ]);
  });
});
