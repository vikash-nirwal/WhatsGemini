import { test, expect, openChat, sendMessage, waitForReplyDone, chatMessages, headerAction } from "./fixtures";

// God mode (#160): what you write becomes true. It changes facts only
// (2026-10-28): nobody answers it, the conversation doesn't carry it as a
// line to reply to, every later reply keeps to it, and it can be removed
// from the Story tab.

test.use({ seed: { messages: 4 } });

test("a change made in god mode is accepted, kept and removable", async ({ page, mockAI }) => {
  mockAI.reply("Of course - our little garage by the sea.");
  await openChat(page);
  await page.getByRole("button", { name: "Composer options" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Toggle god mode" }).click();
  await expect(page.locator('[data-slot="composer-mode"]')).toContainText("God mode");
  await sendMessage(page, "Aria now owns a garage by the sea");
  await expect(chatMessages(page).locator('[data-slot="god-mode"]')).toBeVisible();
  await expect(chatMessages(page).getByText("Aria now owns a garage by the sea")).toBeVisible();
  // Nobody replies to it.
  await page.waitForTimeout(500);
  expect(mockAI.requests.filter((r) => r.stream)).toHaveLength(0);

  // Off again, a normal message: the truth is in the prompt.
  await page.getByRole("button", { name: "Turn off god mode" }).click();
  await sendMessage(page, "how's the garage?");
  await waitForReplyDone(page);
  const reply = mockAI.requests.filter((r) => r.stream).pop()!;
  const system = reply.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("Truths of this story, set by the author");
  expect(system).toContain("A truth changes only what it says");
  expect(system).toContain("- Aria now owns a garage by the sea");
  // The change itself isn't in the conversation as a line to answer.
  expect(reply.messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n")).not.toContain("[Narration] Aria now owns a garage");

  // Listed in the Story tab, and removable.
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: "Story", exact: true }).click();
  const list = page.getByRole("region", { name: "God mode truths" });
  await expect(list).toContainText("Aria now owns a garage by the sea");
  await list.getByRole("button", { name: "Remove: Aria now owns a garage by the sea" }).click();
  await expect(page.getByRole("region", { name: "God mode truths" })).toHaveCount(0);
});
