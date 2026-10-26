import { canUndo, snapshotOf } from "./timeSkipUndo";
import { Character, Chat } from "../../types";

const HOUR = 3_600_000;
const chat = (id: number, times: number[]) => ({ id, title: "c", timestamp: 0, content: times.map((t) => ({ role: "ai", txt: "x", timestamp: t })) }) as unknown as Chat;

test("a skip can be undone while nothing has been said since, for a day", () => {
  const s = { ...snapshotOf(null, "3 years", 10 * HOUR, [chat(1, [HOUR])], [{ id: 1, name: "A" } as Character]), endAt: 10 * HOUR + 5000 };
  expect(canUndo(s, [chat(1, [HOUR, 10 * HOUR + 1000])], 11 * HOUR)).toBe(true);
  expect(canUndo(s, [chat(1, [HOUR, 12 * HOUR])], 13 * HOUR)).toBe(false);
  expect(canUndo(s, [chat(1, [HOUR])], 40 * HOUR)).toBe(false);
  expect(canUndo({ ...s, endAt: undefined }, [chat(1, [HOUR])], 11 * HOUR)).toBe(false);
  expect(canUndo(undefined, [], 0)).toBe(false);
});

test("the snapshot holds whole chats, not archived ones", () => {
  const s = snapshotOf(3, "1 week", 0, [chat(1, [1]), { ...chat(2, []), archived: true } as Chat], [], { id: 3, name: "W", premise: "p", storyTime: undefined } as any);
  expect(s.chats.map((c) => c.id)).toEqual([1]);
  expect(s.world).toEqual({ storyTime: undefined, arc: undefined });
});
