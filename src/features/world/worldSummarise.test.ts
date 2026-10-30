import { chatInWorld, pendingFold, scanWorld } from "./worldSummarise";
import { Character, Chat, Message } from "../../types";

// Each message is 40 characters, about 10 tokens.
const msgs = (n: number): Message[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "you" : "ai", txt: `${String(i).padStart(3, "0")} ${"x".repeat(36)}` } as Message));
const char = (id: number, worldId?: number, extra: Partial<Character> = {}): Character => ({ id, name: `C${id}`, description: "", prompt: "", worldId, ...extra });
const chat = (id: number, characterIds: number[], content: Message[], worldId?: number): Chat => ({ id, title: `Chat ${id}`, timestamp: 0, content, characterIds, worldId } as Chat);

test("only what's past the limit is pending, the same as on send", () => {
  expect(pendingFold(msgs(10), 0, 100)).toBeUndefined(); // 100 tokens: within 1.5x
  expect(pendingFold(msgs(20), 0, 100)).toEqual({ tokens: 100, passes: 1 }); // the newest 10 stay
  expect(pendingFold(msgs(20), 0, 0)).toBeUndefined();
});

test("a chat is in a world when set there, or when everyone in it lives there", () => {
  const people = [char(1, 5), char(2, 5), char(3, 6)];
  expect(chatInWorld(chat(1, [1], []), 5, people)).toBe(true);
  expect(chatInWorld(chat(2, [1, 3], []), 5, people)).toBe(false);
  expect(chatInWorld(chat(3, [3], [], 5), 5, people)).toBe(true);
});

test("the scan finds long chats, adventures and memories in the world only", () => {
  const people = [char(1, 5, { memory: Array.from({ length: 151 }, (_, i) => `fact ${i}`) }), char(2, 5), char(3, 6)];
  const items = scanWorld(
    { id: 5 },
    { chats: [chat(1, [1], msgs(20)), chat(2, [2], msgs(5)), chat(3, [3], msgs(40))], adventures: [{ id: 9, title: "The vault", worldId: 5, content: msgs(30) } as any], characters: people },
    { thresholdMessages: 0, keepTokens: 100 }
  );
  expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(["chat:1", "adventure:9", "memory:1"]);
});
