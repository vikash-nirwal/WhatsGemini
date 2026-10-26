import { wakeNotices } from "./backgroundSync";

const at = (d: number, h = 10) => new Date(2026, 9, d, h).getTime();

test("a wake-up reminds of tomorrow's plans, once, and nudges after a quiet day (#201)", () => {
  const chats = [
    { id: 1, title: "Bonfire", groupPlan: { title: "Bonfire", date: "2026-10-25" }, content: [{ timestamp: at(23) }] },
    { id: 2, groupPlan: { title: "Done", date: "2026-10-25", outcome: "fun" }, content: [] },
    { id: 3, groupPlan: { title: "Later", date: "2026-10-30" }, content: [] },
  ];
  const notices = wakeNotices(chats, at(24), [], 0);
  expect(notices.map((n) => n.title)).toEqual(["Tomorrow: Bonfire", "Your worlds kept going"]);
  expect(notices[0].path).toBe("/chat/1");
  expect(wakeNotices(chats, at(24), [1], at(24) - 1000).map((n) => n.title)).toEqual([]);
  expect(wakeNotices([{ id: 9, content: [{ timestamp: at(24, 8) }] }], at(24), [], 0)).toEqual([]);
});
