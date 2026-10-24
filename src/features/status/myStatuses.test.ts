import { addMyStatus, buildMyStatusNote, buildMyStatusReactionsPrompt, dueReplies, happened, liveMyStatuses, parseMyStatusReactions, statusViewersFor } from "./myStatuses";
import { Character, Chat, MyStatus } from "../../types";

const MINUTE = 60_000;
const NOW = new Date(2026, 9, 24, 12, 0, 0).getTime();
const char = (id: number, name: string, extra: Partial<Character> = {}) => ({ id, name, description: `${name} is a friend.`, ...extra } as Character);
const chat = (id: number, characterIds: number[], timestamp: number, extra: Partial<Chat> = {}) => ({ id, title: "", characterIds, timestamp, content: [], ...extra } as Chat);
const ARIA = char(1, "Aria", { relationship: "best friend" });
const KAI = char(2, "Kai");
const LENA = char(3, "Lena");

describe("your own statuses (#117)", () => {
  it("are seen by the characters you chat with one to one, latest first", () => {
    const chats = [chat(1, [1], 10), chat(2, [2], 20), chat(3, [1, 3], 30), chat(4, [3], 40, { whatIf: { kind: "flashback" } as Chat["whatIf"] })];
    expect(statusViewersFor([ARIA, KAI, LENA], chats).map((c) => c.name)).toEqual(["Kai", "Aria"]);
  });

  it("asks who views, likes, comments or replies, in their own voice", () => {
    const prompt = buildMyStatusReactionsPrompt("Sam", { text: "Finally finished the marathon!" }, [ARIA]);
    expect(prompt).toContain('Sam just posted a status: "Finally finished the marathon!"');
    expect(prompt).toContain("- Aria: (to the user: best friend) Aria is a friend.");
    expect(buildMyStatusReactionsPrompt("Sam", { text: "", image: "data:x" }, [ARIA])).toContain("posted a status with a photo.");
  });

  it("turns the answer into reactions timed after the post", () => {
    const reply = `[{"name": "Aria", "view": true, "like": true, "comment": "So proud of you!", "reply": "you didn't tell me!!"}, {"name": "kai", "view": false}, {"name": "Nobody", "view": true}]`;
    const r = parseMyStatusReactions(reply, [ARIA, KAI], NOW, () => 0.5);
    expect(r.views).toEqual([{ characterId: 1, at: NOW + 15.5 * MINUTE }]);
    expect(r.likes).toEqual([{ characterId: 1, at: NOW + 16 * MINUTE }]);
    expect(r.comments?.[0]).toMatchObject({ from: 1, text: "So proud of you!", at: NOW + 18.5 * MINUTE });
    expect(r.replies).toEqual([{ characterId: 1, text: "you didn't tell me!!", at: NOW + 21.5 * MINUTE }]);
    expect(parseMyStatusReactions("no idea", [ARIA], NOW)).toEqual({ views: [], likes: [], comments: [], replies: [] });
  });

  it("shows only what has happened by now, and finds replies due", () => {
    const status: MyStatus = { id: "s", text: "hi", createdAt: NOW, views: [{ characterId: 1, at: NOW + 5 * MINUTE }, { characterId: 2, at: NOW + MINUTE }], replies: [{ characterId: 1, text: "yo", at: NOW + 6 * MINUTE }, { characterId: 2, text: "sent", at: NOW, sent: true }] };
    expect(happened(status.views, NOW + 2 * MINUTE).map((v) => v.characterId)).toEqual([2]);
    expect(dueReplies([status], NOW + 5 * MINUTE)).toEqual([]);
    expect(dueReplies([status], NOW + 7 * MINUTE)).toEqual([{ status, index: 0 }]);
  });

  it("last a day, ten at most", () => {
    const old: MyStatus = { id: "o", text: "old", createdAt: NOW - 25 * 60 * MINUTE };
    expect(liveMyStatuses([old], NOW)).toEqual([]);
    let list: MyStatus[] = [];
    for (let i = 0; i < 12; i++) list = addMyStatus(list, { id: String(i), text: "", createdAt: NOW });
    expect(list.map((s) => s.id)[0]).toBe("2");
  });

  it("is known to a character once they've seen it", () => {
    const status: MyStatus = { id: "s", text: "Beach day", createdAt: NOW - 2 * 60 * MINUTE, views: [{ characterId: 1, at: NOW - 100 * MINUTE }] };
    expect(buildMyStatusNote("Sam", [status], 1, NOW)).toBe('Sam posted a status 2 hours ago, and you\'ve seen it: "Beach day". Bring it up only if it fits.');
    expect(buildMyStatusNote("Sam", [status], 2, NOW)).toBeUndefined();
  });
});
