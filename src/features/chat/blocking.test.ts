import { blockNotesFor, extractBlockTags, goBetweenDue, mutualFriends, sentWhileBlocked, stripStreamingBlockTags } from "./blocking";
import { Character, Chat } from "../../types";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 25, 12);
const ch = (id: number, name: string, extra: Partial<Character> = {}) => ({ id, name, description: "", prompt: "", ...extra }) as Character;
const chat = (id: number, ids: number[], extra: Partial<Chat> = {}) => ({ id, title: "", timestamp: 0, content: [], characterIds: ids, ...extra }) as unknown as Chat;

describe("blocking (#133)", () => {
  it("reads [Block] and a friend's [Patched up: Name]", () => {
    expect(extractBlockTags("I'm done.\n[Block]")).toEqual({ text: "I'm done.", blocks: true });
    expect(extractBlockTags("Talked to him, he's sorry.\n[Patched up: Kai]")).toEqual({ text: "Talked to him, he's sorry.", patchedUp: "Kai" });
    expect(stripStreamingBlockTags("Bye\n[Block")).toBe("Bye");
  });

  it("finds friends you share: in a group, or who know them, with their own chat with you", () => {
    const kai = ch(2, "Kai");
    const characters = [ch(1, "Aria"), kai, ch(3, "Lena", { knowsAbout: [2] }), ch(4, "Tomás")];
    const chats = [chat(10, [1]), chat(11, [2]), chat(12, [3]), chat(13, [4]), chat(20, [1, 2])];
    expect(mutualFriends(kai, characters, chats).map((c) => c.name)).toEqual(["Aria", "Lena"]);
  });

  it("a friend brings up your block after 12 hours, then every two days", () => {
    const blocked = { by: "you" as const, at: NOW - 13 * HOUR };
    expect(goBetweenDue({ blocked }, NOW)).toBe(true);
    expect(goBetweenDue({ blocked: { ...blocked, at: NOW - HOUR } }, NOW)).toBe(false);
    expect(goBetweenDue({ blocked: { ...blocked, nudgedAt: NOW - 10 * HOUR } }, NOW)).toBe(false);
    expect(goBetweenDue({ blocked: { by: "them", at: NOW - 50 * HOUR } }, NOW)).toBe(false);
  });

  it("marks what you sent after they blocked you, and briefs friends", () => {
    const blocked = { by: "them" as const, at: NOW - HOUR };
    expect(sentWhileBlocked({ blocked }, { role: "you", txt: "hi", timestamp: NOW })).toBe(true);
    expect(sentWhileBlocked({ blocked }, { role: "you", txt: "hi", timestamp: NOW - 2 * HOUR })).toBe(false);
    const aria = ch(1, "Aria", { knowsAbout: [2] });
    const note = blockNotesFor(aria, [aria, ch(2, "Kai")], [chat(10, [1]), chat(11, [2], { blocked })], "Sam");
    expect(note).toContain("Kai blocked Sam after a bad fight");
    expect(note).toContain("[Patched up: Kai]");
  });
});
