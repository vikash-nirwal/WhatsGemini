import { test, expect, openChat, sendMessage, waitForReplyDone } from "./fixtures";

// "On this day" (#83): a year after the first chat, the character's first
// reply of the day is asked to remember it; later replies aren't.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";
type Req = { stream?: boolean; prompt: string; messages: { role: string; content: string }[] };
// The chat replies themselves, not background helpers.
const replies = (requests: Req[]) => requests.filter((r) => r.stream && systemOf(r.messages).includes("Real-world time"));
const lastReplySystem = (requests: Req[]) => systemOf(replies(requests).pop()?.messages || []);

test("a year after the first chat, the first reply of the day remembers it", async ({ page, mockAI }) => {
  // The seeded chat starts on January 15, 2026.
  await page.clock.install({ time: new Date(2027, 0, 15, 15).getTime() });
  mockAI.reply("Can you believe it's been a whole year?");
  await openChat(page);

  await sendMessage(page, "Morning!");
  await waitForReplyDone(page);
  await expect.poll(() => replies(mockAI.requests).length).toBe(1);
  expect(lastReplySystem(mockAI.requests)).toContain("It's one year today since your first chat");

  await sendMessage(page, "It really has.");
  await waitForReplyDone(page);
  await expect.poll(() => replies(mockAI.requests).length).toBe(2);
  expect(lastReplySystem(mockAI.requests)).not.toContain("On this day:");
});

test("on an ordinary day there's no reminder", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2027, 0, 20, 15).getTime() });
  await openChat(page);
  await sendMessage(page, "Morning!");
  await waitForReplyDone(page);
  await expect.poll(() => replies(mockAI.requests).length).toBe(1);
  expect(lastReplySystem(mockAI.requests)).not.toContain("On this day:");
});
