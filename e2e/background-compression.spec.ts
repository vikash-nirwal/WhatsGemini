import { test, expect, openChat, sendMessage, chatMessages, waitForReplyDone } from "./fixtures";

// Summarising a long chat's older messages runs in the background
// (2026-11-20): it used to be awaited before the reply was asked for, so the
// chat sat silent until the summary call came back.

const SUMMARY_ASK = "Summarize the following roleplay conversation";
const isSummary = (req: { prompt: string }) => req.prompt.includes(SUMMARY_ASK);

// A reply names the message it answers. The prompt carries more than the
// typed text (notes after it), so it's matched against what the tests send,
// newest first.
const SENT = ["After the summary", "Second while it summarises", "First while it summarises", "Again", "Hello"];
const replyTo = (req: { prompt: string }) => `Reply to: ${SENT.find((t) => req.prompt.includes(t)) ?? "something"}`;

// A low message-count threshold so the 30-message seed is due a summary on
// the first send; the size rule is off so only that one decides.
test.use({ localStorageOverrides: { compress_threshold: "6", history_keep_tokens: "0" } });

const readChat = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const chat: any = await new Promise((resolve) => {
      const get = db.transaction("chats").objectStore("chats").get(1);
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return (chat.content as any[]).map((m) => (m.isCompressionSummary ? "SUMMARY" : m.txt));
  });

test("you can keep sending while older messages are summarised, and both land", async ({ page, mockAI }) => {
  mockAI.reply((req) => (isSummary(req) ? "Story so far: Aria and the user talked about their day." : req.stream ? replyTo(req) : "{}"));
  await openChat(page, 1);

  // The summary call hangs; replies answer at once.
  const release = mockAI.hold(isSummary);
  await sendMessage(page, "First while it summarises");
  await expect(chatMessages(page).getByText("Reply to: First while it summarises")).toBeVisible();
  await waitForReplyDone(page);
  await expect.poll(() => mockAI.requests.filter(isSummary).length).toBe(1);
  await expect(page.getByRole("status").filter({ hasText: "Summarising older messages" })).toBeVisible();

  // A second send while it's still out: answered, and no second summary.
  await sendMessage(page, "Second while it summarises");
  await expect(chatMessages(page).getByText("Reply to: Second while it summarises")).toBeVisible();
  await waitForReplyDone(page);
  expect(mockAI.requests.filter(isSummary)).toHaveLength(1);

  // The summary lands before what it covered ended, and everything sent
  // meanwhile stays after it.
  release();
  await expect(page.getByRole("status").filter({ hasText: "Summarising older messages" })).toHaveCount(0);
  await expect.poll(async () => (await readChat(page)).includes("SUMMARY")).toBe(true);
  const saved = await readChat(page);
  const at = saved.indexOf("SUMMARY");
  expect(saved.slice(at)).toEqual(expect.arrayContaining(["First while it summarises", "Reply to: First while it summarises", "Second while it summarises", "Reply to: Second while it summarises"]));
  expect(saved.slice(-4)).toEqual(["First while it summarises", "Reply to: First while it summarises", "Second while it summarises", "Reply to: Second while it summarises"]);
  await expect(chatMessages(page).getByText("Reply to: Second while it summarises")).toBeVisible();

  // The next reply's prompt starts from the summary.
  await sendMessage(page, "After the summary");
  await expect(chatMessages(page).getByText("Reply to: After the summary")).toBeVisible();
  const history = mockAI.requests.filter((r) => r.stream).pop()!.messages.map((m) => String(m.content)).join("\n");
  expect(history).toContain("Story so far: Aria and the user talked about their day.");
  expect(history).not.toContain("Aria message 1: how was your day?");
});

test("a failed summary doesn't hold up the chat, and it tries again on the next send", async ({ page, mockAI }) => {
  let fail = true;
  await page.route("**/chat/completions", async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const text = JSON.stringify(body.messages ?? []);
    if (fail && text.includes(SUMMARY_ASK)) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "summary blocked" } }) });
    return route.fallback();
  });
  mockAI.reply((req) => (isSummary(req) ? "Story so far: a retry." : req.stream ? replyTo(req) : "{}"));
  await openChat(page, 1);

  await sendMessage(page, "Hello");
  await expect(chatMessages(page).getByText("Reply to: Hello")).toBeVisible();
  await expect(page.getByText(/Couldn't compress older messages/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Summarising older messages" })).toHaveCount(0);

  fail = false;
  await waitForReplyDone(page);
  await sendMessage(page, "Again");
  await expect(chatMessages(page).getByText("Reply to: Again")).toBeVisible();
  await expect.poll(async () => (await readChat(page)).includes("SUMMARY")).toBe(true);
});
