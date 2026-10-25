import { editorStep } from "./fixtures";
import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, sendMessage, waitForReplyDone, headerAction, messageBubble, MockAIRequest, chatMessages, openContactInfo } from "./fixtures";

// Characters who feel alive between messages (#93-#96): they text first,
// tell you their dreams, have off days, and pick up inside jokes.

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

const openTab = async (page: Page, tab: "Options" | "Story") => {
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: tab, exact: true }).click();
};
const closePanel = (page: Page) => page.getByRole("button", { name: "Close scene panel" }).click();
const closeContact = (page: Page) => page.getByRole("button", { name: "Close contact info" }).click();

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

// A weekday morning, so the texter is awake and a dream can come.
const MORNING = new Date(2026, 9, 21, 9, 0, 0);

test("a character with the switch on texts first after a quiet spell", async ({ page, mockAI }) => {
  await page.clock.install({ time: MORNING });
  mockAI.reply((req) => (req.prompt.includes("now you're messaging first") ? "saw a dog in a tiny raincoat and thought of you" : "Mock reply"));
  await openChat(page);
  await openContactInfo(page);
  await page.getByRole("switch", { name: "Aria texts first" }).click();
  await closeContact(page);
  // The seeded chat was last used months ago.
  await page.clock.fastForward(25_000);

  const bubble = messageBubble(page, "saw a dog in a tiny raincoat");
  await expect(bubble).toBeVisible({ timeout: 15_000 });
  await expect(bubble.getByText("Texted first")).toBeVisible();
  // Never two unanswered: the next check sends nothing.
  await page.clock.fastForward(21 * 60_000);
  await expect(chatMessages(page).getByText("saw a dog in a tiny raincoat")).toHaveCount(1);
  expect(mockAI.requests.filter((r) => r.prompt.includes("now you're messaging first"))).toHaveLength(1);
});

test.describe("someone you've never chatted with", () => {
  // Kai is only in the group chat, with no 1:1 chat of his own.
  test.use({ seed: { messages: 4, room: true } });

  test("switched on in the editor, texts first and starts the chat, up to the limit", async ({ page, mockAI }) => {
    await page.clock.install({ time: MORNING });
    mockAI.reply((req) =>
      req.prompt.includes("You two haven't texted each other yet") ? "hey, it's Kai from the climbing gym" : req.prompt.includes("now you're messaging first") ? "you around?" : "Mock reply"
    );
    await openRoute(page, "/characters/2/edit");
    await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Kai", { timeout: 30_000 });
    await editorStep(page, "Their life");
    const section = page.locator("details").filter({ has: page.locator("summary", { hasText: "Texts first" }) });
    await expect(async () => {
      if ((await section.getAttribute("open")) === null) await section.locator("summary").click();
      await expect(section).toHaveAttribute("open", "");
    }).toPass();
    await section.getByRole("switch", { name: "Kai texts first" }).click();
    await section.getByRole("combobox", { name: "Texts in a row without an answer" }).click();
    await page.getByRole("option", { name: "2", exact: true }).click();
    await expect(section.locator("summary")).toContainText("on, up to 2 without an answer");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await readRow(page, "characters", 2))?.firstTextLimit).toBe(2);

    const kaiChat = () =>
      page.evaluate(async () => {
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          const req = indexedDB.open("ChatAppDB");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const rows = await new Promise<any[]>((resolve) => {
          const get = db.transaction("chats", "readonly").objectStore("chats").getAll();
          get.onsuccess = () => resolve(get.result);
        });
        db.close();
        const chat = rows.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === 2);
        return chat ? { id: chat.id as number, texts: (chat.content || []).map((m: any) => m.txt as string) } : null;
      });

    // The first text opens a new chat with Kai.
    await page.clock.fastForward(25_000);
    await expect.poll(async () => (await kaiChat())?.texts, { timeout: 15_000 }).toEqual(["hey, it's Kai from the climbing gym"]);

    // Unanswered, a second one comes hours later (the limit is two), and
    // Kai knows the first went unanswered.
    await page.clock.fastForward(6 * 60 * 60_000 + 60_000);
    await expect.poll(async () => (await kaiChat())?.texts.length, { timeout: 15_000 }).toBe(2);
    expect(mockAI.requests.find((r) => r.prompt.includes("now you're messaging first"))?.prompt).toContain("You've already texted");

    const chat = await kaiChat();
    await openChat(page, chat!.id);
    await expect(messageBubble(page, "it's Kai from the climbing gym").getByText("Texted first")).toBeVisible();
  });
});

test("on a morning, the first reply can open with a dream", async ({ page, mockAI }) => {
  await page.clock.install({ time: MORNING });
  mockAI.reply("I dreamt the café was underwater and you were serving tea to fish.");
  await openChat(page);
  await openContactInfo(page);
  await page.getByRole("switch", { name: "Aria has dreams" }).click();
  await closeContact(page);

  await sendAndWait(page, mockAI.requests, "Morning!");
  expect(lastSystem(mockAI.requests)).toContain("Aria had a vivid dream last night");
  await expect(messageBubble(page, "serving tea to fish").getByText("A dream")).toBeVisible();
  await expect.poll(async () => (await readRow(page, "characters", 1)).lastDreamAt).toBeGreaterThan(0);

  // Once is enough for the day.
  mockAI.reply("Anyway.");
  await sendMessage(page, "Ha, fish!");
  await expect.poll(() => replies(mockAI.requests).length).toBe(2);
  await waitForReplyDone(page);
  expect(lastSystem(mockAI.requests)).not.toContain("vivid dream");
});

test("an off day can be picked for today, and the replies follow it", async ({ page, mockAI }) => {
  mockAI.reply("*yawns* Sorry, long night.");
  await openChat(page);
  await openContactInfo(page);
  await page.getByRole("switch", { name: "Aria has off days" }).click();
  await page.getByRole("combobox", { name: "Today's mood" }).click();
  await page.getByRole("option", { name: "tired" }).click();
  await expect(page.getByText("Today: tired")).toBeVisible();
  await closeContact(page);

  await sendAndWait(page, mockAI.requests, "You okay?");
  expect(lastSystem(mockAI.requests)).toContain("Today Aria is having an off day: tired");
});

test.describe("inside jokes", () => {
  test.use({ seed: { messages: 30 } });

  test("are noticed every thirty messages, kept in the Story tab and brought back", async ({ page, mockAI }) => {
    mockAI.reply((req) => (req.prompt.includes("has become theirs alone") ? "- Aria calls you 'Captain' since the boat trip" : "Aye aye."));
    await openChat(page);
    await openTab(page, "Story");
    await page.getByRole("switch", { name: /Notice inside jokes/ }).click();
    await page.getByRole("textbox", { name: "New inside joke" }).fill("The pineapple pizza feud");
    await page.getByRole("button", { name: "Add inside joke" }).click();
    await closePanel(page);

    await sendAndWait(page, mockAI.requests, "Ahoy!");
    expect(lastSystem(mockAI.requests)).toContain("- The pineapple pizza feud");
    await expect.poll(() => mockAI.requests.filter((r) => r.prompt.includes("has become theirs alone")).length).toBe(1);

    await openTab(page, "Story");
    const list = page.getByRole("list", { name: "Inside jokes" });
    await expect(list).toContainText("Aria calls you 'Captain' since the boat trip");
    await list.getByRole("button", { name: "Remove: The pineapple pizza feud" }).click();
    await expect(list).not.toContainText("pineapple");
  });
});

// Left on read (#126): with "Always", your message is read and answered
// minutes later, knowing it's late.
test("a character can leave you on read and answer later", async ({ page, mockAI }) => {
  await page.clock.install({ time: MORNING });
  mockAI.reply("sorry, was buried in work. yes!");
  await openChat(page);
  await openContactInfo(page);
  await page.getByRole("combobox", { name: "Aria leaves you on read" }).click();
  await page.getByRole("option", { name: "Always" }).click();
  await closeContact(page);

  await sendMessage(page, "Coffee later?");
  await page.waitForTimeout(500);
  expect(replies(mockAI.requests)).toHaveLength(0);
  await expect.poll(async () => (await readRow(page, "chats", 1)).leftOnReadUntil).toBeGreaterThan(MORNING.getTime());

  // Within the half hour the late reply arrives.
  await page.clock.fastForward(26 * 60_000);
  await expect(messageBubble(page, "sorry, was buried in work")).toBeVisible({ timeout: 15_000 });
  expect(JSON.stringify(replies(mockAI.requests)[0].messages)).toContain("is only answering now");
  await expect.poll(async () => (await readRow(page, "chats", 1)).leftOnReadUntil).toBeUndefined();
});
