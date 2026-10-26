import { byLastActivity, lastActivity } from "./chatOrder";
import { Chat } from "../../types";

const chat = (id: number, timestamp: number, times: number[]) => ({ id, title: `c${id}`, timestamp, content: times.map((t) => ({ role: "ai", txt: "x", timestamp: t })) }) as unknown as Chat;

test("a chat's last activity is its latest message that has happened, or when it was made", () => {
  expect(lastActivity(chat(1, 5, [10, 20]), 100)).toBe(20);
  expect(lastActivity(chat(1, 5, [10, 200]), 100)).toBe(10);
  expect(lastActivity(chat(1, 5, []), 100)).toBe(5);
});

test("the list puts the latest conversation first", () => {
  const items = [chat(1, 1, [10]), chat(2, 2, [50]), chat(3, 30, [])].map((c) => ({ chat: c }));
  expect(byLastActivity(items, 100).map((i) => i.chat.id)).toEqual([2, 3, 1]);
});
