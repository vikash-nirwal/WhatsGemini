import { Character, MyStatus } from "../../types";
import { buildStatusesNote } from "./statusNote";

// Statuses in a 1:1 reply (#233).
const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const kai = { id: 2, name: "Kai" };
const aria: Character = {
  id: 1, name: "Aria", description: "", prompt: "",
  statuses: [
    { id: "old", text: "Gone a while", createdAt: NOW - 40 * HOUR },
    { id: "s1", text: "Rough day at the docks", createdAt: NOW - 3 * HOUR, seen: true, likes: [2], comments: [
      { id: "c1", from: "you", text: "What happened?", at: NOW - 2 * HOUR },
      { id: "c2", from: 1, text: "Tell you later", at: NOW - 2 * HOUR + 1, replyTo: "c1" },
      { id: "c3", from: 2, text: "Chin up", at: NOW - HOUR },
      { id: "future", from: 2, text: "not yet", at: NOW + HOUR },
    ] },
  ],
};
const mine: MyStatus = {
  id: "m1", text: "Sunset at the pier", createdAt: NOW - 5 * HOUR,
  views: [{ characterId: 1, at: NOW - 4 * HOUR }], likes: [{ characterId: 1, at: NOW - 4 * HOUR }],
  comments: [
    { id: "a", from: 1, text: "Gorgeous!", at: NOW - 4 * HOUR },
    { id: "b", from: "you", text: "You should've come", at: NOW - 3 * HOUR, replyTo: "a" },
    { id: "k", from: 2, text: "Kai's own comment", at: NOW - 3 * HOUR },
  ],
};

describe("statuses in a 1:1 reply", () => {
  it("brings their own recent status, its reactions and the comments that have happened", () => {
    const note = buildStatusesNote({ character: aria, characters: [kai], userName: "Sam", myStatuses: [], now: NOW })!;
    expect(note).toContain('You posted a status 3 hours ago: "Rough day at the docks". Sam has seen it; 1 other liked it.');
    expect(note).toContain('  Sam: "What happened?"\n  you: "Tell you later"\n  Kai: "Chin up"');
    expect(note).not.toContain("not yet");
    expect(note).not.toContain("Gone a while");
  });

  it("brings your status they've seen with only your exchange under it", () => {
    const note = buildStatusesNote({ character: aria, characters: [kai], userName: "Sam", myStatuses: [mine], now: NOW })!;
    expect(note).toContain("Sam posted a status 5 hours ago, and you've seen it: \"Sunset at the pier\". You liked it.");
    expect(note).toContain('  you: "Gorgeous!"\n  Sam: "You should\'ve come"');
    expect(note).not.toContain("Kai's own comment");
  });

  it("leaves out comments the chat already has, but not a status it only quotes", () => {
    const chat = { content: [{ role: "you" as const, txt: "Chin up", quotedStatus: { owner: 1, text: "Sunset at the pier" } }] };
    const note = buildStatusesNote({ character: aria, characters: [kai], userName: "Sam", myStatuses: [mine], chat, now: NOW })!;
    expect(note).toContain("Sunset at the pier");
    expect(note).not.toContain("Chin up");
    expect(buildStatusesNote({ character: { ...aria, statuses: [] }, characters: [], userName: "Sam", myStatuses: [], now: NOW })).toBeUndefined();
  });
});
