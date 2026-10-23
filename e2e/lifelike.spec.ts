import type { Page } from "@playwright/test";
import { test, expect, openChat, sendMessage, waitForReplyDone, headerAction, MockAIRequest } from "./fixtures";

// More lifelike characters (#106-#108): moods that carry over, one consistent
// day, and texting imperfections.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";
const replies = (requests: MockAIRequest[]) => requests.filter((r) => r.stream);
const lastSystem = (requests: MockAIRequest[]) => systemOf(replies(requests).pop()?.messages || []);
// Sends, then waits until that message's reply was asked for and has finished.
const sendAndWait = async (page: Page, requests: MockAIRequest[], text: string) => {
  const before = replies(requests).length;
  await sendMessage(page, text);
  await expect.poll(() => replies(requests).length, { timeout: 15_000 }).toBe(before + 1);
  await waitForReplyDone(page);
};

const openChatTab = async (page: Page) => {
  await headerAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
};
const closePanel = (page: Page) => page.getByRole("button", { name: "Close scene panel" }).click();

// A weekday at ten in the morning, when the day's account is due.
const MORNING = new Date(2026, 9, 21, 10, 0, 0);

test("a mood lingers after a reply and colours the next one, until cleared (#106)", async ({ page, mockAI }) => {
  mockAI.reply("[Emotion: sad] I really didn't expect that from you.");
  await openChat(page);
  await openChatTab(page);
  await page.getByRole("switch", { name: "Moods linger" }).click();
  const moodLine = page.getByTestId("lingering-mood");
  await expect(moodLine).toHaveText(/Nothing hanging over/);
  await closePanel(page);

  await sendAndWait(page, mockAI.requests, "I forgot your birthday");
  // The reply is asked to report its emotion, even without emotion portraits.
  expect(lastSystem(mockAI.requests)).toContain("[Emotion: <word>]");
  await openChatTab(page);
  await expect(moodLine).toHaveText(/Still sad · since/);
  await closePanel(page);

  // The next reply knows what's hanging over, and from what.
  mockAI.reply("[Emotion: neutral] It's fine.");
  await sendAndWait(page, mockAI.requests, "I'm so sorry");
  const system = lastSystem(mockAI.requests);
  expect(system).toContain("Aria was sad, after");
  expect(system).toContain('"I forgot your birthday"');

  await openChatTab(page);
  await moodLine.getByRole("button", { name: "Clear" }).click();
  await expect(moodLine).toHaveText(/Nothing hanging over/);
});

test("one account of the day is written once and reaches the reply's prompt (#107)", async ({ page, mockAI }) => {
  await page.clock.install({ time: MORNING });
  mockAI.reply((req) => (req.prompt.includes("day has been like so far") ? "Aria opened the café at seven and the espresso machine gave up by nine." : "Mock reply"));
  await openChat(page);
  await openChatTab(page);
  await page.getByRole("switch", { name: "Aria has one consistent day" }).click();
  const dayLog = page.getByTestId("day-log");
  await expect(dayLog).toContainText("Not written yet today");
  await closePanel(page);

  // The writer's first check comes a few seconds after load.
  await page.clock.fastForward(10_000);
  await openChatTab(page);
  await expect(dayLog).toContainText("espresso machine gave up", { timeout: 15_000 });
  await closePanel(page);
  const written = mockAI.requests.filter((r) => r.prompt.includes("day has been like so far")).length;
  expect(written).toBe(1);

  await sendAndWait(page, mockAI.requests, "morning!");
  expect(lastSystem(mockAI.requests)).toContain("What Aria's day has actually been like today: Aria opened the café at seven");

  // Written once a day: another check asks for nothing.
  await page.clock.fastForward(21 * 60_000);
  await expect.poll(() => mockAI.requests.filter((r) => r.prompt.includes("day has been like so far")).length).toBe(1);
});

test("a sloppy texter's prompt loosens up in texting mode, and the setting is kept (#108)", async ({ page, mockAI }) => {
  await openChat(page);
  await openChatTab(page);
  await page.getByRole("button", { name: "On", exact: true }).click();
  await page.getByRole("combobox", { name: "How Aria texts" }).click();
  await page.getByRole("option", { name: "Plenty of slips" }).click();
  await closePanel(page);

  await sendAndWait(page, mockAI.requests, "hey");
  expect(lastSystem(mockAI.requests)).toContain("Aria texts fast and loose");

  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await openChatTab(page);
  await expect(page.getByRole("combobox", { name: "How Aria texts" })).toHaveText("Plenty of slips");
  await closePanel(page);

  // A clean texter gets no such note.
  await openChatTab(page);
  await page.getByRole("combobox", { name: "How Aria texts" }).click();
  await page.getByRole("option", { name: "Clean" }).click();
  await closePanel(page);
  await sendAndWait(page, mockAI.requests, "ok");
  expect(lastSystem(mockAI.requests)).not.toContain("fast and loose");
});
