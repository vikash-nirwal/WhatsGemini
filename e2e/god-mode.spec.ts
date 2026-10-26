import { test, expect, openChat, sendMessage, waitForReplyDone, chatMessages, headerAction } from "./fixtures";

// God mode (#160): what you write becomes true; the character carries on
// without questioning it, every later reply carries it, and it can be
// removed from the Story tab.

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
  await waitForReplyDone(page);
  const first = mockAI.requests.filter((r) => r.stream)[0];
  expect(JSON.stringify(first.messages)).toContain('The author just made this true: \\"Aria now owns a garage by the sea\\"');

  // Off again, a normal message: the truth is in the prompt.
  await page.getByRole("button", { name: "Turn off god mode" }).click();
  await sendMessage(page, "how's the garage?");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("Truths of this story, set by the author");
  expect(system).toContain("- Aria now owns a garage by the sea");

  // Listed in the Story tab, and removable.
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: "Story", exact: true }).click();
  const list = page.getByRole("region", { name: "God mode truths" });
  await expect(list).toContainText("Aria now owns a garage by the sea");
  await list.getByRole("button", { name: "Remove: Aria now owns a garage by the sea" }).click();
  await expect(page.getByRole("region", { name: "God mode truths" })).toHaveCount(0);
});
