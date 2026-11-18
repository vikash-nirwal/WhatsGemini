import { test, expect, openChat, headerAction, sendMessage, waitForReplyDone, messageBubble } from "./fixtures";

// Long chats (the out-of-memory crash of 2026-11-18): a chat renders only
// its newest messages, "Show earlier messages" adds older ones without
// moving what you're reading, and search still reaches the oldest.

test.use({ seed: { messages: 400 } });

const bubbles = (page: import("@playwright/test").Page) => page.locator("[data-message-id]");

test("a long chat renders its newest messages, and older ones on request", async ({ page, mockAI }) => {
  await openChat(page);
  await expect(messageBubble(page, "Aria message 399:")).toBeVisible();
  await expect(bubbles(page)).toHaveCount(150);
  await expect(page.getByText("Aria message 1:", { exact: false })).toHaveCount(0);

  // Older messages go in above, and the one at the top stays where it was.
  const top = bubbles(page).first();
  const topId = await top.getAttribute("data-message-id");
  await top.scrollIntoViewIfNeeded();
  const before = await top.boundingBox();
  await page.getByRole("button", { name: "Show earlier messages" }).click();
  await expect(bubbles(page)).toHaveCount(300);
  const after = await page.locator(`[data-message-id="${topId}"]`).boundingBox();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);

  // A reply still comes in at the bottom, with nothing dropped from the top.
  mockAI.reply("Long time no see!");
  await sendMessage(page, "Hello again");
  await expect(messageBubble(page, "Long time no see!")).toBeVisible();
  await waitForReplyDone(page);
  await expect(bubbles(page)).toHaveCount(302);
});

test("search reaches a message older than what's rendered", async ({ page }) => {
  await openChat(page);
  await expect(bubbles(page)).toHaveCount(150);
  await headerAction(page, "Search this chat");
  const search = page.getByRole("search", { name: "Search this chat" });
  await search.getByLabel("Search messages").fill("aria MESSAGE 3:");
  await expect(search).toContainText("1 of 1");
  const hit = page.locator('[data-search-hit="true"]');
  await expect(hit).toContainText("Aria message 3:");
  await expect(hit).toBeInViewport();
});
