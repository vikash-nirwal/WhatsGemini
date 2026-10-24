import type { Page } from "@playwright/test";
import { test, expect, openChat, sendMessage, waitForReplyDone, headerAction, messageBubble, MockAIRequest, chatMessages } from "./fixtures";

// Ways of telling the story (#101-#105): their side of the story,
// flashbacks, episodes with cliffhangers, what-if worlds and role reversal.

test.use({ seed: { messages: 6 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";
const replies = (requests: MockAIRequest[]) => requests.filter((r) => r.stream);
const lastSystem = (requests: MockAIRequest[]) => systemOf(replies(requests).pop()?.messages || []);

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

const PASSAGE = "I kept watching the door while we talked. I didn't say it, but I was hoping you'd stay a little longer than usual.";

test("their side of the story can be read and kept in their diary", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.includes("Retell this scene from Aria's side") ? PASSAGE : "Mock reply"));
  await openChat(page);
  await headerAction(page, "Aria's side of the story");
  const dialog = page.getByRole("dialog", { name: "Aria's side of the story" });
  await expect(dialog.getByText("I kept watching the door")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep in Aria's diary" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await readRow(page, "characters", 1)).diary?.[0]?.text).toBe(PASSAGE);
});

test("a flashback is its own chat, and ending it adds to their past", async ({ page, mockAI }) => {
  mockAI.reply((req) =>
    req.prompt.includes("In one or two sentences, write what happened")
      ? "As a girl, Aria hid in the bakery's flour store during a storm and has loved the smell of bread ever since."
      : req.stream
        ? "*Rain drums on the bakery roof as ten-year-old Aria squeezes between the flour sacks.*"
        : "Mock"
  );
  await openChat(page);
  await headerAction(page, "Flashback (a scene from their past)");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Childhood" }).click();
  await dialog.getByRole("textbox", { name: "Who you play in it" }).fill("the baker");
  await dialog.getByRole("button", { name: "Start the flashback" }).click();

  await expect(chatMessages(page).getByText("ten-year-old Aria squeezes between the flour sacks")).toBeVisible({ timeout: 15_000 });
  expect(page.url()).not.toMatch(/#\/chat\/1$/);
  const opening = lastSystem(mockAI.requests);
  expect(opening).toContain("This chat is a flashback, set before Aria ever met");
  expect(opening).toContain("plays the baker in this scene");

  await sendMessage(page, "Who's hiding in my flour?");
  await waitForReplyDone(page);
  await headerAction(page, "End flashback (add it to their past)");
  await expect(page.getByText("End of the flashback. As a girl, Aria hid")).toBeVisible();
  await expect.poll(async () => (await readRow(page, "characters", 1)).pastEvents).toEqual([expect.stringContaining("loved the smell of bread")]);

  // The main chat gets a note, and every chat knows their past now.
  await openChat(page, 1);
  await expect(page.getByText("Flashback, childhood: As a girl, Aria hid")).toBeVisible();
  const before = replies(mockAI.requests).length;
  await sendMessage(page, "What's your favourite smell?");
  await expect.poll(() => replies(mockAI.requests).length).toBe(before + 1);
  await waitForReplyDone(page);
  expect(lastSystem(mockAI.requests)).toContain("Aria's past (things that happened before the story");
});

test("a what-if world opens a new chat that doesn't touch the main story", async ({ page, mockAI }) => {
  mockAI.reply("*Neon rain.* Aria leans out of the noodle stall. \"You look lost, choom.\"");
  await openChat(page);
  await headerAction(page, "What-if universe");
  await page.getByRole("dialog").getByRole("button", { name: "Cyberpunk" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Go there" }).click();
  await expect(chatMessages(page).getByText("You look lost, choom.")).toBeVisible({ timeout: 15_000 });
  expect(lastSystem(mockAI.requests)).toContain("This chat is a what-if, an alternate universe: A neon megacity");
  const id = Number(page.url().match(/chat\/(\d+)/)?.[1]);
  const chat = await readRow(page, "chats", id);
  expect(chat).toMatchObject({ title: "Aria · Cyberpunk", memoryScope: "chat", whatIf: { kind: "universe", parentChatId: 1 } });
});

test("an episode ends on a cliffhanger with a teaser, and the next reply picks up the hook", async ({ page, mockAI }) => {
  mockAI.reply((req) => {
    if (req.prompt.includes("Next time on")) return "TEASER: A stranger at the door. A secret, finally told.\nHOOK: Someone is knocking at midnight.";
    if (!req.stream) return "TITLE: The Knock\nRECAP: A quiet night turned strange.\nSUMMARY:\nStory so far: a quiet night, then a knock.";
    return systemOf(req.messages).includes("This reply ends the episode") ? "*Three slow knocks. Aria freezes.* \"Nobody knows I live here.\"" : "*She opens the door.*";
  });
  await openChat(page);
  await headerAction(page, "End episode (on a cliffhanger)");
  await expect(chatMessages(page).getByText("Nobody knows I live here.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Episode 1: The Knock")).toBeVisible();
  await expect(page.locator('[data-slot="episode-teaser"]')).toContainText("A stranger at the door.");

  const before = replies(mockAI.requests).length;
  await sendMessage(page, "Don't open it!");
  await expect.poll(() => replies(mockAI.requests).length).toBe(before + 1);
  await waitForReplyDone(page);
  expect(lastSystem(mockAI.requests)).toContain("The last episode ended on a cliffhanger: Someone is knocking at midnight.");
  await expect.poll(async () => (await readRow(page, "chats", 1)).pendingHook).toBeUndefined();
});

test("roles can be swapped for a scene, and swapped back", async ({ page, mockAI }) => {
  mockAI.reply("*You straighten your jacket.* Fine, Aria, you win this round.");
  await openChat(page);
  await headerAction(page, "Swap roles (you write as Aria)");
  await expect(page.getByText("Roles swapped: you're writing as Aria")).toBeVisible();
  await expect(page.getByLabel("Message input")).toHaveAttribute("placeholder", /Write as Aria/);

  await sendMessage(page, "Admit it, I'm the funny one.");
  await expect.poll(() => replies(mockAI.requests).length).toBe(1);
  await waitForReplyDone(page);
  const system = lastSystem(mockAI.requests);
  expect(system).toContain("Role reversal: for this scene you play");
  expect(system).toContain("the person writing to you is playing Aria");
  await expect(messageBubble(page, "I'm the funny one").getByText("You, as Aria")).toBeVisible();
  await expect(messageBubble(page, "you win this round").getByText(/^Aria, as /)).toBeVisible();

  await headerAction(page, "Swap back");
  await expect(page.getByText("Roles back:")).toBeVisible();
  mockAI.reply("Back to me!");
  await sendMessage(page, "Okay, back to normal.");
  await expect.poll(() => replies(mockAI.requests).length).toBe(2);
  await waitForReplyDone(page);
  expect(lastSystem(mockAI.requests)).not.toContain("Role reversal");
});
