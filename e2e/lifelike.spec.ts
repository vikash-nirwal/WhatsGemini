import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, sendMessage, waitForReplyDone, headerAction, MockAIRequest } from "./fixtures";

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

const readRow = (page: Page, store: string, id: number) =>
  page.evaluate(
    async ({ store, id }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const row = await new Promise<any>((resolve) => {
        const get = db.transaction(store, "readonly").objectStore(store).get(id);
        get.onsuccess = () => resolve(get.result);
      });
      db.close();
      return row;
    },
    { store, id }
  );

// Memory with time (#109): facts carry when they were learned.
const writeMemoryDates = (page: Page, memory: string[], memoryDates: Record<string, { learnedAt: number; mentionedAt?: number }>) =>
  page.evaluate(async ({ memory, memoryDates }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("characters", "readwrite");
      const store = tx.objectStore("characters");
      const get = store.get(1);
      get.onsuccess = () => store.put({ ...get.result, memory, memoryDates });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { memory, memoryDates });

test("facts show when they were learned, reach the prompt dated, and one from a while back is offered (#109)", async ({ page, mockAI }) => {
  await page.clock.install({ time: MORNING });
  const march = new Date(2026, 2, 12, 9, 0, 0).getTime();
  await openChat(page);
  await writeMemoryDates(page, ["Sam was nervous about the Leeds interview.", "Sam likes jazz."], {
    "Sam was nervous about the Leeds interview.": { learnedAt: march },
    "Sam likes jazz.": { learnedAt: MORNING.getTime() - 60_000 },
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await headerAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Memory", exact: true }).click();
  await expect(page.getByText("learned 12 Mar")).toBeVisible();
  await expect(page.getByText("Sam likes jazz.")).toBeVisible();
  await expect(page.getByText("Sam likes jazz.")).not.toContainText("learned");
  await closePanel(page);

  await sendAndWait(page, mockAI.requests, "hey");
  const system = lastSystem(mockAI.requests);
  expect(system).toContain("- Sam was nervous about the Leeds interview. (learned 12 Mar)");
  expect(system).toContain("- Sam likes jazz.\n");
  expect(system).toContain("you told me back in March");
  // The old fact is the one from a while back; the fresh one isn't offered.
  expect(system).toContain('"Sam was nervous about the Leeds interview." (Aria learned it 7 months ago)');

  // Offered once: the chat notes it, and the next reply waits a couple of days for another.
  await expect.poll(() => readRow(page, "chats", 1).then((row) => row?.callbackAt)).toBeTruthy();
  await sendAndWait(page, mockAI.requests, "and?");
  expect(lastSystem(mockAI.requests)).not.toContain("Aria learned it");
});

test("a character who misremembers is told to, in a sentence (#109)", async ({ page, mockAI }) => {
  await openChat(page);
  await writeMemoryDates(page, ["Sam likes jazz."], {});
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await openChatTab(page);
  await page.getByRole("switch", { name: "Aria sometimes misremembers" }).click();
  await closePanel(page);
  await sendAndWait(page, mockAI.requests, "hey");
  expect(lastSystem(mockAI.requests)).toContain("corrects themselves in the same reply");
});

test("a character's own preoccupations are written weekly and reach the reply's prompt (#110)", async ({ page, mockAI }) => {
  await page.clock.install({ time: MORNING });
  mockAI.reply((req) => (req.prompt.includes("in their own life this week") ? "NEW: Aria's landlord wants to inspect the flat on Friday.\nNEW: Aria wants to try pottery." : "Mock reply"));
  await openChat(page);
  await openChatTab(page);
  await page.getByRole("switch", { name: "Aria has their own preoccupations" }).click();
  const list = page.getByTestId("preoccupations");
  await expect(list).toContainText("Nothing written yet this week");
  await closePanel(page);

  await page.clock.fastForward(14_000);
  await openChatTab(page);
  await expect(list).toContainText("inspect the flat on Friday", { timeout: 15_000 });
  await expect(list).toContainText("try pottery");
  // One can be dropped by hand.
  await list.getByRole("button", { name: "Drop: Aria wants to try pottery." }).click();
  await expect(list).not.toContainText("try pottery");
  await closePanel(page);

  await sendAndWait(page, mockAI.requests, "hey");
  const system = lastSystem(mockAI.requests);
  expect(system).toContain("Things going on in Aria's own life right now");
  expect(system).toContain("- Aria's landlord wants to inspect the flat on Friday. (since today)");
  expect(system).not.toContain("pottery");

  // Written once a week: an hour later nothing more is asked.
  await page.clock.fastForward(61 * 60_000);
  await expect.poll(() => mockAI.requests.filter((r) => r.prompt.includes("in their own life this week")).length).toBe(1);
});

test("a writing profile set in the editor is saved and kept to in every prompt (#111)", async ({ page, mockAI }) => {
  await openRoute(page, "/characters/1/edit");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  const section = page.locator("details").filter({ has: page.locator("summary", { hasText: "How Aria writes" }) });
  await expect(async () => {
    if ((await section.getAttribute("open")) === null) await section.locator("summary").click();
    await expect(section).toHaveAttribute("open", "");
  }).toPass();
  await section.getByRole("combobox", { name: "Message length" }).click();
  await page.getByRole("option", { name: "Short (a line or two)" }).click();
  await section.getByRole("combobox", { name: "Emoji" }).click();
  await page.getByRole("option", { name: "Never" }).click();
  await section.getByRole("switch", { name: "Mostly lowercase" }).click();
  await expect(section.locator("summary")).toContainText("3 habits");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await openChat(page);
  await sendAndWait(page, mockAI.requests, "hey");
  expect(lastSystem(mockAI.requests)).toContain("How Aria writes: keeps messages short, a line or two; writes mostly in lowercase; never uses emoji. Keep to this in every reply");

  // Saved on the character: the editor shows it again.
  await openRoute(page, "/characters/1/edit");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await expect(section.locator("summary")).toContainText("3 habits");
});
