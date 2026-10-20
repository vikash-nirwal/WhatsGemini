import type { Page } from "@playwright/test";
import { test, expect, openChat, sendMessage, waitForReplyDone, messageBubble } from "./fixtures";

// Story script (#57): written before the roleplay, every reply gets the
// premise, the directions and only the current beat, and a reply that
// reports [Beat done] moves the story on.

test.use({ seed: { messages: 0 } });

const PREMISE = "Two strangers share a night train to Vienna.";
const BEAT_1 = "They meet in the dining car.";
const BEAT_2 = "A storm stops the train in the mountains.";

const writeScript = async (page: Page) => {
  await page.getByRole("button", { name: "Write the story" }).click();
  const dialog = page.getByRole("dialog", { name: "Story script" });
  await dialog.getByLabel("Premise").fill(PREMISE);
  await dialog.getByLabel("Beat 1", { exact: true }).fill(BEAT_1);
  await dialog.getByRole("button", { name: "Add beat" }).click();
  await dialog.getByLabel("Beat 2", { exact: true }).fill(BEAT_2);
  await dialog.getByLabel("Directions for the AI").fill("Slow burn. No violence.");
  await dialog.getByRole("button", { name: "Save script" }).click();
  await expect(dialog).toBeHidden();
};

const systemPrompt = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

test("replies follow the current beat and move on when it's done", async ({ page, mockAI }) => {
  await openChat(page);
  await writeScript(page);
  const progress = page.getByRole("region", { name: "Story progress" });
  await expect(progress).toContainText(`Beat 1 of 2: ${BEAT_1}`);

  mockAI.reply("*She slides into the seat across from you.* Is this taken?\n[Beat done]");
  await sendMessage(page, "Hello there.");
  await expect(messageBubble(page, "Is this taken?")).toBeVisible();
  await waitForReplyDone(page);
  await expect(messageBubble(page, "Is this taken?")).not.toContainText("[Beat");
  await expect(progress).toContainText(`Beat 2 of 2: ${BEAT_2}`);

  const first = systemPrompt(mockAI.requests[0].messages);
  expect(first).toContain(`Premise: ${PREMISE}`);
  expect(first).toContain(`Current beat: ${BEAT_1}`);
  expect(first).not.toContain(BEAT_2);
  expect(first).toContain("Slow burn. No violence.");

  mockAI.reply("The train shudders to a halt.");
  await sendMessage(page, "What was that?");
  await expect.poll(() => mockAI.requests.length).toBe(2);
  expect(systemPrompt(mockAI.requests[1].messages)).toContain(`Current beat: ${BEAT_2}`);

  // Beats can also be moved by hand.
  await waitForReplyDone(page);
  await progress.getByRole("button", { name: "Mark beat done" }).click();
  await expect(progress).toContainText("All 2 beats done");
  await progress.getByRole("button", { name: "Previous beat" }).click();
  await expect(progress).toContainText("Beat 2 of 2");
});

test("a pasted story is split into beats, and a script can be saved as a template", async ({ page, mockAI }) => {
  await openChat(page);
  mockAI.reply(JSON.stringify({ premise: "A heist at the opera.", beats: ["Case the building", "Swap the necklace", "Escape by boat"], directions: "Witty, fast", ending: "They get away" }));
  await page.getByRole("button", { name: "Write the story" }).click();
  const dialog = page.getByRole("dialog", { name: "Story script" });
  await dialog.getByText("Paste a story or script").click();
  await dialog.getByLabel("Story to split into beats").fill("Three thieves rob the opera house during the premiere and escape by boat.");
  await dialog.getByRole("button", { name: "Split into beats" }).click();
  await expect(dialog.getByLabel("Premise")).toHaveValue("A heist at the opera.");
  await expect(dialog.getByLabel("Beat 3", { exact: true })).toHaveValue("Escape by boat");

  await dialog.getByLabel("Template name").fill("Opera heist");
  await dialog.getByRole("button", { name: "Save as template" }).click();
  await dialog.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("region", { name: "Story progress" })).toContainText("Beat 1 of 3: Case the building");

  // Remove it, then bring it back from the template.
  await page.getByRole("region", { name: "Story progress" }).getByRole("button", { name: "Edit" }).click();
  await dialog.getByRole("button", { name: "Remove script" }).click();
  await page.getByRole("button", { name: "Write the story" }).click();
  await dialog.getByRole("group", { name: "Load a template" }).getByRole("button", { name: "Opera heist" }).click();
  await expect(dialog.getByLabel("Premise")).toHaveValue("A heist at the opera.");
});
