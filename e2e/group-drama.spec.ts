import type { Page } from "@playwright/test";
import { test, expect, openChat, headerAction, sendMessage, waitForReplyDone, messageBubble, MockAI, MockAIRequest } from "./fixtures";

// Fights and inside jokes in a group (#250): a fight is between you and the
// member you hurt, only their prompt carries it and only they can make up;
// the group's inside jokes reach every member.

test.use({ seed: { room: true } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";
const speakerOf = (messages: { role: string; content: string }[]) => systemOf(messages).match(/You are roleplaying as (\w+)\./)?.[1];
const lastPromptOf = (requests: MockAIRequest[], name: string) => systemOf([...requests].reverse().find((r) => speakerOf(r.messages) === name)?.messages || []);
const repliesFrom = (requests: MockAIRequest[], name: string) => requests.filter((r) => speakerOf(r.messages) === name).length;

const openRoomPanel = async (page: Page, tab: "Story" | "Options" | "Group") => {
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: tab, exact: true }).click();
};
const closePanel = (page: Page) => page.getByRole("button", { name: "Close scene panel" }).click();

// Everyone answers each message, Aria first, so both prompts are seen. The
// panel is open already.
const everyoneAnswers = async (page: Page) => {
  await page.getByRole("tab", { name: "Group", exact: true }).click();
  await page.getByRole("button", { name: "Everyone", exact: true }).click();
};
// Sends, then waits until both members have answered it.
const sendToBoth = async (page: Page, mockAI: MockAI, text: string) => {
  const kai = repliesFrom(mockAI.requests, "Kai");
  await sendMessage(page, text);
  await expect.poll(() => repliesFrom(mockAI.requests, "Kai"), { timeout: 20_000 }).toBe(kai + 1);
  await waitForReplyDone(page);
};

test("a fight in a group is with one member, who alone can make up", async ({ page, mockAI }) => {
  let round = 0;
  mockAI.reply((req) => {
    const speaker = speakerOf(req.messages);
    if (speaker === "Kai") {
      round += 1;
      return round === 1 ? "Wow. Okay.\n[Upset: you called my car a wreck]" : round === 2 ? "Whatever." : "...Fine. Thanks for saying it.\n[Made up]";
    }
    // Aria makes up too, though the fight isn't hers: nothing should change.
    return speaker === "Aria" && round === 1 ? "Aria winces.\n[Made up]" : `${speaker || "Someone"} shrugs.`;
  });
  await openChat(page, 2);
  await openRoomPanel(page, "Options");
  await page.getByRole("switch", { name: "Fights that need making up" }).click();
  await everyoneAnswers(page);
  await closePanel(page);

  await sendToBoth(page, mockAI, "Kai, your car is a wreck.");
  expect(lastPromptOf(mockAI.requests, "Kai")).toContain("If the user genuinely hurts, insults, dismisses or betrays Kai");
  const hurt = messageBubble(page, "Wow. Okay.");
  await expect(hurt).not.toContainText("[Upset");
  await expect(hurt.getByText("Upset with you")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Kai is upset with you · you called my car a wreck" })).toBeVisible();

  // Aria's [Made up] in the next round doesn't end Kai's fight.
  await sendToBoth(page, mockAI, "Come on, it was a joke.");
  expect(lastPromptOf(mockAI.requests, "Kai")).toContain("Kai is upset with the user about: you called my car a wreck");
  const aria = lastPromptOf(mockAI.requests, "Aria");
  expect(aria).toContain("Kai is upset with the user right now (about: you called my car a wreck). You may notice the tension, in a line at most");
  expect(aria).not.toContain("Kai is upset with the user about:");
  await expect(messageBubble(page, "Aria winces.")).not.toContainText("Made up");
  await expect(page.getByRole("status").filter({ hasText: "Kai is upset with you" })).toBeVisible();

  await sendToBoth(page, mockAI, "I'm sorry, Kai. You love that car and I was mean about it.");
  await expect(messageBubble(page, "Thanks for saying it").getByText("Made up")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Kai is upset with you ·")).toHaveCount(0);
});

test("a group's inside jokes reach every member and are noticed for the group", async ({ page, mockAI }) => {
  mockAI.reply((req) => {
    if (req.prompt.includes("has become this group's own")) return "- Everyone calls the user 'Captain' since the boat trip";
    const speaker = speakerOf(req.messages);
    return speaker ? `${speaker} grins.` : "OK";
  });
  await openChat(page, 2);
  // As if the last check was more than thirty messages ago, so the next
  // reply runs one.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("chats", "readwrite");
      const store = tx.objectStore("chats");
      const get = store.get(2);
      get.onsuccess = () => store.put({ ...get.result, jokesCheckedAt: -40 });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await openRoomPanel(page, "Story");
  await page.getByRole("switch", { name: /Notice inside jokes/ }).click();
  await page.getByRole("textbox", { name: "New inside joke" }).fill("Kai's car is called the Beast");
  await page.getByRole("button", { name: "Add inside joke" }).click();
  await everyoneAnswers(page);
  await closePanel(page);

  await sendToBoth(page, mockAI, "Who's driving the Beast today?");
  for (const name of ["Aria", "Kai"]) {
    const prompt = lastPromptOf(mockAI.requests, name);
    expect(prompt).toContain("Things only this group shares (the user, Aria and Kai)");
    expect(prompt).toContain("- Kai's car is called the Beast");
  }
  await expect.poll(() => mockAI.requests.filter((r) => r.prompt.includes("has become this group's own")).length).toBe(1);
  expect(mockAI.requests.find((r) => r.prompt.includes("has become this group's own"))!.prompt).toContain("group roleplay between the user, Aria and Kai");

  await openRoomPanel(page, "Story");
  const list = page.getByRole("list", { name: "Inside jokes" });
  await expect(list).toContainText("Everyone calls the user 'Captain' since the boat trip");
  await expect(list).toContainText("Kai's car is called the Beast");
});
