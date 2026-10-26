import { knowsNoteFor, recentLetterNote, recentOffscreenTalk, roomContextFor } from "./promptNotes";
import { Character, Chat, Message } from "../../types";

const NOW = Date.UTC(2026, 9, 22, 12);
const char = (id: number, name: string, extra: Partial<Character> = {}): Character => ({ id, name, description: "", prompt: "", ...extra });
const msgs = (n: number, from: number): Message[] => Array.from({ length: n }, (_, i) => ({ role: "you", txt: `m${i}`, timestamp: from + i * 1000 }));
const chatWith = (content: Message[], extra: Partial<Chat> = {}): Chat => ({ id: 1, title: "t", timestamp: 0, content, characterIds: [1], ...extra } as Chat);

describe("prompt notes", () => {
  it("only keeps a letter or a talk while it's within the last ten messages", () => {
    const aria = char(1, "Aria", { letters: [{ id: "l", at: NOW, text: "Dear you", chatId: 1 }] });
    expect(recentLetterNote(aria, chatWith(msgs(4, NOW - 10_000)), 1, "Vik")).toContain("you wrote them this letter");
    expect(recentLetterNote(aria, chatWith(msgs(12, NOW + 1000)), 1, "Vik")).toBeUndefined();
    expect(recentLetterNote(aria, chatWith(msgs(4, 0)), 2, "Vik")).toBeUndefined();

    const room = chatWith(msgs(3, NOW - 5000), { offscreenTalks: [{ id: "t", at: NOW, lines: [{ speakerId: 1, text: "Hi" }] }] });
    expect(recentOffscreenTalk(room, [char(1, "Aria")])).toContain("While the user was away, Aria talked privately");
  });

  it("builds a room speaker's context from the others", () => {
    const aria = char(1, "Aria", { appearanceImages: ["a.png"] });
    const kai = char(2, "Kai", { appearanceImages: ["k.png"] });
    const ctx = roomContextFor(kai, [aria, kai], chatWith([], { scenario: "A garage", roomRelationships: [{ fromId: 2, toId: 1, note: "Admires her" }] }));
    expect(ctx.otherParticipants).toEqual(["Aria"]);
    expect(ctx.otherParticipantImages).toEqual([{ name: "Aria", images: ["a.png"] }]);
    expect(ctx.groupScenario).toBe("A garage");
    expect(ctx.relationshipNotes).toContain("- Aria: Admires her");
    expect(ctx.othersAbout).toBe("Who else is in this group:\n- Aria");
  });

  it("says who the other members are, and uses an older group's note as its scene", () => {
    const aria = char(1, "Aria", { description: "A mechanic who restores old bikes.", relationship: "Best friend" });
    const kai = char(2, "Kai", { prompt: "You are Kai, a pilot." });
    const ctx = roomContextFor(kai, [aria, kai], chatWith([], { authorNote: "Rainy night in the garage" }));
    expect(ctx.othersAbout).toBe("Who else is in this group:\n- Aria: A mechanic who restores old bikes. (with the user: Best friend)");
    expect(ctx.groupScenario).toBe("Rainy night in the garage");
    expect(roomContextFor(kai, [aria, kai], chatWith([], { scenario: "Garage", authorNote: "Note" })).groupScenario).toBe("Garage");
  });

  it("summarises the other bonds a character knows about", () => {
    const aria = char(1, "Aria", { knowsAbout: [2] });
    const kai = char(2, "Kai", { relationship: "Rival" });
    const kaiChat = { ...chatWith(msgs(3, NOW - 3600_000)), id: 2, characterIds: [2] } as Chat;
    expect(knowsNoteFor(aria, [aria, kai], [kaiChat], "Vik", NOW)).toContain("- Kai (Rival): they've talked now and then this week.");
    expect(knowsNoteFor(char(1, "Aria"), [], [], "Vik", NOW)).toBeUndefined();
  });
});

describe("group chats carry each speaker's own context", () => {
  const { buildOthersAbout, ownChatNoteFor } = require("./promptNotes");
  const aria = { id: 1, name: "Aria", ties: [{ withId: 2, tie: "your brother" }] };
  const kai = { id: 2, name: "Kai", description: "A mechanic.", relationship: "Rival" };
  test("the others are named with what they are to the speaker", () => {
    expect(buildOthersAbout([kai], aria)).toBe("Who else is in this group:\n- Kai [your brother]: A mechanic. (with the user: Rival)");
  });
  test("the speaker's private chat with you comes along, latest first chat, last lines", () => {
    const chats = [
      { id: 1, characterIds: [1], timestamp: 5, content: [{ role: "you", txt: "see you at the docks" }, { role: "ai", txt: "bring coffee" }, { role: "you", txt: "*waves*", isNarration: true }] },
      { id: 2, characterIds: [1, 2], timestamp: 9, content: [{ role: "you", txt: "group hi" }] },
    ];
    expect(ownChatNoteFor(aria, chats, "Sam")).toBe("Your own private chat with Sam lately (the others here didn't see it; keep private things private unless you choose to share):\nSam: see you at the docks\nAria: bring coffee");
    expect(ownChatNoteFor(kai, chats, "Sam")).toBeUndefined();
  });
});

describe("information between private chats and groups (review, 2026-10-26)", () => {
  const { groupChatsNoteFor, knowsNoteFor } = require("./promptNotes");
  const now = 10 * 86_400_000;
  const aria = { id: 1, name: "Aria", knowsAbout: [2] };
  const kai = { id: 2, name: "Kai", memory: ["Sam hates mornings", "Sam and Kai kissed"], memoryCategories: { "Sam hates mornings": "user", "Sam and Kai kissed": "relationship" } };
  test("what happened in a shared group lately reaches the private chat", () => {
    const chats = [
      { id: 1, title: "Aria", characterIds: [1], content: [] },
      { id: 2, title: "Bonfire", characterIds: [1, 2], memory: ["They planned a bonfire"], content: [{ role: "you", txt: "who brings wood?", timestamp: now - 1000 }, { role: "ai", speakerId: 2, txt: "me", timestamp: now - 500 }] },
      { id: 3, title: "Old", characterIds: [1, 2], content: [{ role: "you", txt: "ancient", timestamp: 1 }] },
    ];
    const note = groupChatsNoteFor(aria, chats, [aria, kai], "Sam", 1, now);
    expect(note).toContain('In the group "Bonfire":');
    expect(note).toContain("- They planned a bonfire");
    expect(note).toContain("Sam: who brings wood?\nKai: me");
    expect(note).not.toContain("ancient");
    expect(groupChatsNoteFor(aria, chats, [aria, kai], "Sam", 2, now)).toBeUndefined();
  });
  test("what the user and someone else are to each other stays private", () => {
    const note = knowsNoteFor(aria, [aria, kai], [], "Sam", now);
    expect(note).toContain("Sam hates mornings");
    expect(note).not.toContain("kissed");
  });
});
