import { addTalk, buildOffscreenTalkPrompt, buildOffscreenTalkSection, parseOffscreenTalk, pickPair, talkDue, IDLE_BEFORE_TALK_MS, TALK_GAP_MS } from "./offscreenTalk";
import { Character } from "../../types";

const NOW = Date.UTC(2026, 9, 22, 12);
const char = (id: number, name: string): Character => ({ id, name, description: "", prompt: "" });
const aria = char(1, "Aria");
const kai = char(2, "Kai Moreno");
const lin = char(3, "Lin");
const msgAt = (t: number) => ({ role: "you", txt: "hi", timestamp: t });

describe("talkDue", () => {
  const base = { offscreenTalk: true, characterIds: [1, 2], content: [msgAt(NOW - IDLE_BEFORE_TALK_MS - 1)], timestamp: 0 };
  it("waits until you've been away a while, and only once per stretch away", () => {
    expect(talkDue(base, NOW)).toBe(true);
    expect(talkDue({ ...base, offscreenTalk: false }, NOW)).toBe(false);
    expect(talkDue({ ...base, content: [msgAt(NOW - 60_000)] }, NOW)).toBe(false);
    expect(talkDue({ ...base, offscreenTalks: [{ id: "t", at: NOW - 60_000, lines: [] }] }, NOW)).toBe(false);
    // A talk before your last visit, long enough ago, lets the next one happen.
    expect(talkDue({ ...base, offscreenTalks: [{ id: "t", at: NOW - IDLE_BEFORE_TALK_MS - TALK_GAP_MS - 2, lines: [] }] }, NOW)).toBe(true);
  });
});

describe("who talks and what they said", () => {
  it("prefers a pair with feelings about each other", () => {
    expect(pickPair([aria, kai, lin], [{ fromId: 3, toId: 1, note: "Envies her" }])!.map((c) => c.id)).toEqual([3, 1]);
    const pair = pickPair([aria, kai], undefined, () => 0)!;
    expect(new Set(pair.map((c) => c.id))).toEqual(new Set([1, 2]));
  });

  it("reads Name: line rows for the two of them only", () => {
    expect(parseOffscreenTalk("Aria: Did you see their face?\n**Kai:** Yeah. Weird day.\nLin: hi\nnarration", [aria, kai])).toEqual([
      { speakerId: 1, text: "Did you see their face?" },
      { speakerId: 2, text: "Yeah. Weird day." },
    ]);
  });

  it("builds the prompt and the note for the next replies", () => {
    expect(buildOffscreenTalkPrompt(aria, kai, "Vik", ["Aria about Kai Moreno: Resents him"], "Vik: bye")).toContain("between Aria and Kai Moreno, two characters from a group chat with Vik");
    expect(buildOffscreenTalkSection({ id: "t", at: NOW, lines: [{ speakerId: 1, text: "Hi" }, { speakerId: 2, text: "Hey" }] }, { 1: "Aria", 2: "Kai" })).toBe(
      "While the user was away, Aria and Kai talked privately:\nAria: Hi\nKai: Hey\nThey remember it and can bring it up naturally; the user may have read it too."
    );
    expect(addTalk(Array.from({ length: 6 }, (_, i) => ({ id: `${i}`, at: i, lines: [] })), { id: "new", at: 9, lines: [] })).toHaveLength(5);
  });
});
