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
  });

  it("summarises the other bonds a character knows about", () => {
    const aria = char(1, "Aria", { knowsAbout: [2] });
    const kai = char(2, "Kai", { relationship: "Rival" });
    const kaiChat = { ...chatWith(msgs(3, NOW - 3600_000)), id: 2, characterIds: [2] } as Chat;
    expect(knowsNoteFor(aria, [aria, kai], [kaiChat], "Vik", NOW)).toContain("- Kai (Rival): they've talked now and then this week.");
    expect(knowsNoteFor(char(1, "Aria"), [], [], "Vik", NOW)).toBeUndefined();
  });
});
