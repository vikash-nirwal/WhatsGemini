import { buildRelationshipMap, circleLayout } from "./relationshipMap";
import { Character, Chat } from "../../types";

const ch = (id: number, name: string, extra: Partial<Character> = {}) => ({ id, name, description: "", prompt: "", ...extra }) as Character;
const chat = (id: number, ids: number[], extra: Partial<Chat> = {}) => ({ id, title: "", timestamp: 0, content: [], characterIds: ids, ...extra }) as unknown as Chat;

describe("relationship map (#138)", () => {
  it("shows who knows whom, how they feel, and each bond with you", () => {
    const characters = [
      ch(1, "Aria", { relationship: "Close friend", relationshipHistory: [{ from: "Acquaintance", to: "Close friend", at: 1 }], knowsAbout: [3] }),
      ch(2, "Kai", { relationship: "Rival" }),
      ch(3, "Lena"),
      ch(4, "Nobody"),
    ];
    const chats = [chat(1, [1], { stage: "dating" }), chat(2, [2]), chat(3, [3]), chat(9, [1, 2], { roomRelationships: [{ fromId: 2, toId: 1, note: "still jealous" }] })];
    const { nodes, links } = buildRelationshipMap(characters, chats);
    expect(nodes.map((n) => n.name)).toEqual(["Aria", "Kai", "Lena"]);
    expect(nodes[0]).toMatchObject({ bond: "Close friend", was: "Acquaintance", stage: "Dating" });
    expect(links).toEqual([
      { a: 1, b: 3, feelings: [] },
      { a: 1, b: 2, feelings: ["Kai about Aria: still jealous"] },
    ]);
  });

  it("puts people on a circle starting at the top", () => {
    expect(circleLayout(2, 100, 100, 50)).toEqual([{ x: 100, y: 50 }, { x: 100, y: 150 }]);
  });
});
