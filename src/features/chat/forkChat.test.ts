import { buildFork } from "./forkChat";
import { Chat } from "../../types";

const chat = (extra: Partial<Chat> = {}): Chat => ({
  id: 1,
  title: "Aria",
  timestamp: 0,
  characterIds: [1],
  content: [
    { id: "a", role: "ai", txt: "Hi" },
    { id: "b", role: "you", txt: "Hello" },
    { id: "c", role: "ai", txt: "How are you?" },
  ],
  worldId: 3,
  game: { kind: "riddles", turns: 2, startedAt: 0 },
  ...extra,
} as Chat);

describe("fork into a new chat (#86)", () => {
  it("copies the conversation up to the message, and the chat's own settings", () => {
    const fork = buildFork(chat(), "b", { id: 1, name: "Aria", description: "", prompt: "", memory: ["Vik loves rain"] })!;
    expect(fork.title).toBe("Aria (what if)");
    expect(fork.content.map((m) => m.id)).toEqual(["a", "b"]);
    expect(fork.worldId).toBe(3);
    expect(fork.game).toBeUndefined();
  });

  it("gives a 1:1 fork its own copy of the character's memory", () => {
    const fork = buildFork(chat(), "c", { id: 1, name: "Aria", description: "", prompt: "", memory: ["Vik loves rain"] })!;
    expect(fork.memoryScope).toBe("chat");
    expect(fork.memory).toEqual(["Vik loves rain"]);
  });

  it("does nothing for a message that isn't there", () => {
    expect(buildFork(chat(), "zzz", undefined)).toBeUndefined();
  });
});
