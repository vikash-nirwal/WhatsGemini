import { Character, Chat, Message } from "../types";
import { IdMaps, rehomeTalks, remapChannel, remapChat, remapMessage, remapWorld } from "./backupRemap";

// Relinking a restored library (#235).
const maps: IdMaps = { characters: new Map([[1, 11], [2, 12]]), chats: new Map([[5, 15]]), worlds: new Map([[3, 13]]) };

it("relinks everyone a message names, and drops who wasn't restored", () => {
  const m = {
    role: "ai", txt: "hi", speakerId: 1,
    replyTo: { text: "x", from: 9 },
    poll: { question: "?", options: ["a"], votes: [{ voter: "you", option: 0, at: 1 }, { voter: 2, option: 0, at: 1 }, { voter: 9, option: 0, at: 1 }] },
    contactCard: { name: "Kai", about: "", characterId: 2 },
    characterReaction: { emoji: "❤️", speakerId: 9 },
  } as unknown as Message;
  const out = remapMessage(m, maps.characters);
  expect(out.speakerId).toBe(11);
  expect(out.replyTo).toBeUndefined();
  expect(out.poll!.votes.map((v) => v.voter)).toEqual(["you", 12]);
  expect(out.contactCard!.characterId).toBe(12);
  expect(out.characterReaction).toEqual({ emoji: "❤️" });
});

it("relinks a group's own references", () => {
  const chat = {
    id: 5, title: "Crew", characterIds: [1, 2, 9], content: [],
    roomRelationships: [{ fromId: 1, toId: 2, note: "fond" }, { fromId: 1, toId: 9, note: "gone" }],
    offscreenTalks: [{ id: "o", at: 1, lines: [{ speakerId: 2, text: "psst" }] }],
    groupPlan: { title: "Bonfire", memberIds: [1, 9], at: 1 },
    blocked: { by: "them", at: 1, nudgedBy: 2 },
  } as unknown as Chat;
  const out = remapChat(chat, maps);
  expect(out.characterIds).toEqual([11, 12]);
  expect(out.roomRelationships).toEqual([{ fromId: 11, toId: 12, note: "fond" }]);
  expect(out.offscreenTalks![0].lines[0].speakerId).toBe(12);
  expect(out.groupPlan!.memberIds).toEqual([11]);
  expect(out.blocked!.nudgedBy).toBe(12);
});

it("relinks the people around, channels, and moves talks to the lower id", () => {
  // Takes on an announcement follow their people; a missing one is dropped.
  expect(remapWorld({ id: 3, name: "W", premise: "", announcements: [{ id: "a", text: "News", at: 1, takes: { 2: "You cheer.", 9: "You sulk." } }] }, maps).announcements).toEqual([{ id: "a", text: "News", at: 1, takes: { 12: "You cheer." } }]);
  expect(remapWorld({ id: 3, name: "W", premise: "", extras: [{ name: "Tom", about: "landlord", tiedTo: 2, at: 1 }, { name: "Ann", about: "", tiedTo: 9, at: 1 }] }, maps).extras).toEqual([{ name: "Tom", about: "landlord", tiedTo: 12, at: 1 }, { name: "Ann", about: "", at: 1 }]);
  expect(remapChannel({ id: "world-3", kind: "world", refId: 3, followedAt: 0, posts: [] }, maps)?.id).toBe("world-13");
  expect(remapChannel({ id: "character-9", kind: "character", refId: 9, followedAt: 0, posts: [] }, maps)).toBeUndefined();
  const high = { id: 20, name: "A", talks: [{ id: "t1", withId: 10, at: 2, lines: [] }] } as unknown as Character;
  const low = { id: 10, name: "B", talks: [{ id: "t0", withId: 20, at: 1, lines: [] }] } as unknown as Character;
  const [a, b] = rehomeTalks([high, low]);
  expect(a.talks).toEqual([]);
  expect(b.talks!.map((t) => [t.id, t.withId])).toEqual([["t0", 20], ["t1", 20]]);
});
