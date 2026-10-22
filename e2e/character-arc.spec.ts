import { test, expect, openChat, sendMessage, waitForReplyDone, headerAction } from "./fixtures";

// Character arc suggestions (#60): every 40 messages a cheap check may
// suggest how the character has grown; a kept note joins every prompt.

test.use({ seed: { messages: 40 }, localStorageOverrides: { roleplay_style: JSON.stringify({ relationshipSuggestions: false, arcSuggestions: true }) } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

test("a growth note is suggested, kept, and shapes the next replies", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.includes("has clearly grown or changed as a person") ? "More open about her past since the night at the lake." : "Mm, tell me more."));
  await openChat(page);
  await sendMessage(page, "Thanks for telling me all that.");
  await waitForReplyDone(page);

  const card = page.getByRole("region", { name: "Character growth" });
  await expect(card).toContainText("More open about her past since the night at the lake.");
  await card.getByRole("button", { name: "Keep this" }).click();
  await expect(card).toHaveCount(0);

  await sendMessage(page, "How are you feeling?");
  await expect.poll(() => systemOf(mockAI.requests.filter((r) => r.stream).pop()?.messages || [])).toContain("How Aria has changed over the story so far");

  await headerAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Memory", exact: true }).click();
  await expect(page.getByRole("list", { name: "How Aria has grown" })).toContainText("More open about her past");
});
