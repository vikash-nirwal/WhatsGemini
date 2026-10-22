import { Character, CharacterStatus, Chat } from "../../types";
import { buildCommentReplyPrompt, buildFeedReactionsPrompt, feedItems, feedPeersFor, parseFeedReactions, toggleLike, withComment } from "./statusFeed";

const char = (id: number, name: string, extra: Partial<Character> = {}) => ({ id, name, description: `${name} desc`, ...extra } as unknown as Character);
const ARIA = char(1, "Aria");
const KAI = char(2, "Kai");
const MIRA = char(3, "Mira", { knowsAbout: [1] });
const LONE = char(4, "Lone");
const room = { id: 9, characterIds: [1, 2], content: [], roomRelationships: [{ fromId: 2, toId: 1, note: "finds her too cheerful" }] } as unknown as Chat;
const status: CharacterStatus = { id: "s1", text: "Pottery tonight!", createdAt: 1000 };

describe("character feed", () => {
  it("finds who sees a status: room-mates and those who know of the poster", () => {
    const peers = feedPeersFor(ARIA, [ARIA, KAI, MIRA, LONE], [room]);
    expect(peers.map((p) => [p.character.name, p.feeling])).toEqual([["Kai", "finds her too cheerful"], ["Mira", undefined]]);
  });

  it("asks for reactions shaped by how each friend feels", () => {
    const prompt = buildFeedReactionsPrompt(ARIA, status, feedPeersFor(ARIA, [ARIA, KAI], [room]));
    expect(prompt).toContain('Aria just posted a status for their friends: "Pottery tonight!"');
    expect(prompt).toContain("How Kai feels about Aria: finds her too cheerful.");
  });

  it("reads likes and comments, ignoring strangers and repeats", () => {
    const peers = feedPeersFor(ARIA, [ARIA, KAI, MIRA], [room]);
    const { likes, comments } = parseFeedReactions('[{"name": "kai", "like": true, "comment": "Try not to break the wheel."}, {"name": "Kai", "like": true, "comment": "again"}, {"name": "Bob", "like": true, "comment": "hi"}, {"name": "Mira", "like": false, "comment": ""}]', peers, 5000);
    expect(likes).toEqual([2]);
    expect(comments.map((c) => [c.from, c.text])).toEqual([[2, "Try not to break the wheel."]]);
    expect(parseFeedReactions("not json", peers, 0)).toEqual({ likes: [], comments: [] });
  });

  it("likes, comments and lists the feed newest first", () => {
    expect(toggleLike(status).likedByYou).toBe(true);
    expect(toggleLike(toggleLike(status)).likedByYou).toBeUndefined();
    const commented = withComment(status, { id: "c1", from: 2, text: "Nice", at: 2000 });
    expect(buildCommentReplyPrompt(ARIA, commented, "Have fun!", "Sam")).toContain('Sam commented: "Have fun!"');
    const items = feedItems([char(1, "Aria", { statuses: [status] }), char(2, "Kai", { statuses: [{ id: "s2", text: "Engine day", createdAt: 3000 }] })]);
    expect(items.map((i) => i.status.id)).toEqual(["s2", "s1"]);
  });
});
