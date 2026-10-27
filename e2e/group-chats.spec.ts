import type { Page } from "@playwright/test";
import { test, expect, openChat, headerAction, sendMessage, waitForReplyDone, messageBubble, KAI, MockAI } from "./fixtures";

// Group chats (#22-#24): who answers a message (taking turns, naturally or
// everyone), a narrator after each round, and what each member privately
// feels about the others.

test.use({ seed: { room: true } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";
const speakerOf = (messages: { role: string; content: string }[]) => systemOf(messages).match(/You are roleplaying as (\w+)\./)?.[1];

// Replies by who's asked: the helper calls get a name list or narration,
// each character answers as themself.
const replyByRequest = (mockAI: MockAI, who: string) => {
  mockAI.reply((req) => {
    if (req.prompt.includes("Who would naturally reply")) return who;
    if (req.prompt.includes("You are the narrator of a group roleplay")) return "Narration: Rain drums on the garage roof.";
    const speaker = speakerOf(req.messages);
    return speaker ? `${speaker} says hello back.` : "OK";
  });
};

const openRoomPanel = async (page: Page, tab: "Scene" | "Group") => {
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: tab, exact: true }).click();
};

test("natural turns: the helper picks who answers, in order", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "Kai, Aria");
  await openChat(page, 2);
  await openRoomPanel(page, "Group");
  await page.getByRole("button", { name: "Natural", exact: true }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await sendMessage(page, "Who wants coffee?");
  await expect(messageBubble(page, "Kai says hello back.")).toBeVisible();
  await expect(messageBubble(page, "Aria says hello back.")).toBeVisible({ timeout: 15_000 });
  await waitForReplyDone(page);
  const speakers = mockAI.requests.map((r) => speakerOf(r.messages)).filter(Boolean);
  expect(speakers.slice(0, 2)).toEqual(["Kai", "Aria"]);
});

test("natural turns: nobody may answer", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "NONE");
  await openChat(page, 2);
  await openRoomPanel(page, "Group");
  await page.getByRole("button", { name: "Natural", exact: true }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await sendMessage(page, "*hums quietly*");
  await expect(page.getByText("Nobody jumped in.")).toBeVisible();
  expect(mockAI.requests.some((r) => speakerOf(r.messages))).toBe(false);
});

test("everyone answers, then the narrator adds a line", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "");
  await openChat(page, 2);
  await openRoomPanel(page, "Group");
  await page.getByRole("button", { name: "Everyone", exact: true }).click();
  await page.getByRole("switch", { name: "Narrator" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await sendMessage(page, "Hey both, what's the plan?");
  await expect(messageBubble(page, "Aria says hello back.")).toBeVisible();
  await expect(messageBubble(page, "Kai says hello back.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Rain drums on the garage roof.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Narration: Rain drums")).toHaveCount(0);
});

test("a member's feelings about another go only into their own prompt", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "");
  await openChat(page, 2);
  await openRoomPanel(page, "Scene");
  await page.getByRole("button", { name: "Add a relationship" }).click();
  const rel = page.getByRole("group", { name: "Relationship 1" });
  await rel.getByRole("combobox", { name: "Who", exact: true }).click();
  await page.getByRole("option", { name: KAI.name, exact: true }).click();
  await rel.getByRole("combobox", { name: "About whom" }).click();
  await page.getByRole("option", { name: "Aria", exact: true }).click();
  await rel.getByLabel("How they feel").fill("Secretly admires her driving");
  await rel.getByLabel("How they feel").blur();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  // Taking turns: the seed's last speaker was Kai, so both get a go over two messages.
  await sendMessage(page, "Morning!");
  await waitForReplyDone(page);
  await sendMessage(page, "Anyone up for a drive?");
  await waitForReplyDone(page);
  const byName = (name: string) => mockAI.requests.find((r) => speakerOf(r.messages) === name);
  await expect.poll(() => Boolean(byName("Kai") && byName("Aria"))).toBe(true);
  expect(systemOf(byName("Kai")!.messages)).toContain("How you feel about the others here (keep it in mind; don't announce it):\n- Aria: Secretly admires her driving");
  expect(systemOf(byName("Aria")!.messages)).not.toContain("Secretly admires");
});

test("a member speaking up on their own gets the rest of the round too", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "");
  await openChat(page, 2);
  await openRoomPanel(page, "Group");
  await page.getByRole("button", { name: "Everyone", exact: true }).click();
  await page.getByRole("switch", { name: "Narrator" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await headerAction(page, "Make the next bot send a follow-up now");
  await expect(messageBubble(page, "Aria says hello back.")).toBeVisible();
  await expect(messageBubble(page, "Kai says hello back.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Rain drums on the garage roof.")).toBeVisible({ timeout: 15_000 });
});

test("natural turns after a member spoke up ask about the others only", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "NONE");
  await openChat(page, 2);
  await openRoomPanel(page, "Group");
  await page.getByRole("button", { name: "Natural", exact: true }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await headerAction(page, "Make the next bot send a follow-up now");
  await expect(messageBubble(page, "Aria says hello back.")).toBeVisible();
  await expect.poll(() => mockAI.requests.find((r) => r.prompt.includes("Who would naturally reply"))?.prompt || "").toContain("Aria just sent the last message. Only these others can answer it: Kai.");
  await waitForReplyDone(page);
  expect(mockAI.requests.filter((r) => speakerOf(r.messages)).length).toBe(1);
});

test("room-wide inner thoughts and member diaries are switched on in the Chat tab", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "");
  await openChat(page, 2);
  await openRoomPanel(page, "Group");
  await page.getByRole("switch", { name: "Show everyone's inner thoughts" }).click();
  await page.getByRole("switch", { name: "Kai keeps a diary" }).click();
  await expect(page.getByRole("switch", { name: "Kai keeps a diary" })).toBeChecked();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await sendMessage(page, "What's everyone thinking?");
  await expect.poll(() => systemOf(mockAI.requests.find((r) => speakerOf(r.messages))?.messages || [])).toContain("add your private inner thoughts in exactly this format: <thoughts>");
});

test("with the scene tracked, members who leave stop taking turns until they're back", async ({ page, mockAI }) => {
  await openChat(page, 2);
  // Taking turns, so who's next is known (Lively, the default, picks freely).
  await openRoomPanel(page, "Group");
  await page.getByRole("button", { name: "Taking turns" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();
  await openRoomPanel(page, "Scene");
  await page.getByRole("switch", { name: "Track the scene" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  // Aria answers first (round-robin), and the state says Kai has gone.
  mockAI.reply((req) => {
    const speaker = speakerOf(req.messages);
    return speaker === "Aria" ? "Kai just stepped out for parts.\n<state>location: the garage; present: Aria</state>" : `${speaker} says hello back.`;
  });
  await sendMessage(page, "Where's Kai?");
  await expect(messageBubble(page, "Kai just stepped out for parts.")).toBeVisible();
  await waitForReplyDone(page);
  await expect(page.getByRole("group", { name: "Scene state" })).toContainText("Aria");
  expect(systemOf(mockAI.requests[0].messages)).toContain('"present" lists which of Aria, Kai are in the scene');

  // Kai would be next, but he's away, so Aria answers again.
  await sendMessage(page, "Okay, just us then.");
  await expect.poll(() => mockAI.requests.length).toBe(2);
  expect(speakerOf(mockAI.requests[1].messages)).toBe("Aria");
  await waitForReplyDone(page);

  // Back in by hand.
  await openRoomPanel(page, "Scene");
  const here = page.getByRole("group", { name: "Who's here" });
  await expect(here.getByRole("button", { name: "Kai" })).toHaveAttribute("aria-pressed", "false");
  await here.getByRole("button", { name: "Kai" }).click();
  await expect(here.getByRole("button", { name: "Kai" })).toHaveAttribute("aria-pressed", "true");
});

test("members talk while you're away, and the next replies know it", async ({ page, mockAI }) => {
  await page.clock.install();
  mockAI.reply((req) => {
    if (req.prompt.startsWith("Write a short private conversation")) return "Aria: Do you think they'll come back tonight?\nKai: They always do. Hand me that wrench.";
    const speaker = speakerOf(req.messages);
    return speaker ? `${speaker} says hello back.` : "OK";
  });
  await openChat(page, 2);
  // On by default since 2026-10-27; the switch shows it.
  await openRoomPanel(page, "Group");
  await expect(page.getByRole("switch", { name: "Members talk while you're away" })).toBeChecked();
  await page.getByRole("button", { name: "Close scene panel" }).click();
  // The seeded room was last used months ago, so a talk is due at the first check.
  await page.clock.fastForward(25_000);

  const card = page.getByText("Aria and Kai talked while you were gone");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await expect(page.getByText("Do you think they'll come back tonight?")).toBeVisible();

  await sendMessage(page, "I'm back!");
  await expect.poll(() => systemOf(mockAI.requests.find((r) => speakerOf(r.messages))?.messages || [])).toContain("While the user was away, Aria and Kai talked privately:");
});

// Group chats feel like the same people (the user's report, 2026-10-26):
// each speaker knows what the others are to them, their own life, and what
// they and you said in private lately.
test("each member brings their ties and your private chat into the group", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "Aria");
  await openChat(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const os = db.transaction("characters", "readwrite").objectStore("characters");
      const get = os.get(1);
      get.onsuccess = () => {
        os.put({ ...get.result, ties: [{ withId: 2, tie: "your brother" }] });
        os.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  });
  await page.reload();
  await openChat(page, 2);
  await sendMessage(page, "hey both");
  await waitForReplyDone(page);
  const aria = mockAI.requests.filter((r) => r.stream).map((r) => systemOf(r.messages)).find((s) => s.includes("You are roleplaying as Aria."))!;
  expect(aria).toContain("- Kai [your brother]");
  expect(aria).toContain("Your own private chat with");
  expect(aria).toContain("Aria message");
});

// The other way (review, 2026-10-26): what was said in a group reaches the
// members' private chats, so they don't forget it there.
test("a member remembers the group in your private chat", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "Aria");
  await openChat(page, 2);
  await sendMessage(page, "bonfire on saturday?");
  await waitForReplyDone(page);
  await openChat(page, 1);
  await sendMessage(page, "about saturday");
  await waitForReplyDone(page);
  const system = systemOf(mockAI.requests.filter((r) => r.stream).pop()!.messages);
  expect(system).toContain('In the group "Aria & Kai":');
  expect(system).toContain("bonfire on saturday?");
});

// Lively, the default (#188): the member you speak to answers.
test("in a lively group, whoever you address answers", async ({ page, mockAI }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.9; // no extra reaction this time
  });
  replyByRequest(mockAI, "");
  await openChat(page, 2);
  await sendMessage(page, "Kai, can you look at my car?");
  await waitForReplyDone(page);
  expect(speakerOf(mockAI.requests.filter((r) => r.stream)[0].messages)).toBe("Kai");
});
