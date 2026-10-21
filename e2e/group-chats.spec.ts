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

const openRoomPanel = async (page: Page, tab: "Scene" | "Chat") => {
  await headerAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: tab, exact: true }).click();
};

test("natural turns: the helper picks who answers, in order", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "Kai, Aria");
  await openChat(page, 2);
  await openRoomPanel(page, "Chat");
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
  await openRoomPanel(page, "Chat");
  await page.getByRole("button", { name: "Natural", exact: true }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await sendMessage(page, "*hums quietly*");
  await expect(page.getByText("Nobody jumped in.")).toBeVisible();
  expect(mockAI.requests.some((r) => speakerOf(r.messages))).toBe(false);
});

test("everyone answers, then the narrator adds a line", async ({ page, mockAI }) => {
  replyByRequest(mockAI, "");
  await openChat(page, 2);
  await openRoomPanel(page, "Chat");
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
  await openRoomPanel(page, "Chat");
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
  await openRoomPanel(page, "Chat");
  await page.getByRole("button", { name: "Natural", exact: true }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await headerAction(page, "Make the next bot send a follow-up now");
  await expect(messageBubble(page, "Aria says hello back.")).toBeVisible();
  await expect.poll(() => mockAI.requests.find((r) => r.prompt.includes("Who would naturally reply"))?.prompt || "").toContain("Aria just sent the last message. Only these others can answer it: Kai.");
  await waitForReplyDone(page);
  expect(mockAI.requests.filter((r) => speakerOf(r.messages)).length).toBe(1);
});
