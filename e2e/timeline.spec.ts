import { test, expect, openChat, openRoute, sendMessage, waitForReplyDone } from "./fixtures";

// A world's timeline (#161): what happens in a world is written down as it
// happens - here a god-mode change - and shown newest first, filterable.

test.use({ seed: { messages: 2 } });

test("a god-mode change shows on the world's timeline", async ({ page, mockAI }) => {
  mockAI.reply("Of course.");
  await openChat(page);
  await page.getByRole("button", { name: "Composer options" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Toggle god mode" }).click();
  await sendMessage(page, "It has snowed all week");
  await waitForReplyDone(page);

  await openRoute(page, "/worlds/mine/timeline");
  const timeline = page.getByRole("list", { name: "World timeline" });
  await expect(timeline).toContainText("Made true", { timeout: 30_000 });
  await expect(timeline).toContainText("It has snowed all week");
  await expect(timeline).toContainText("Today");
});

test("an empty world's timeline says what will show there", async ({ page }) => {
  await openRoute(page, "/worlds/mine/timeline");
  await expect(page.getByText("Nothing has happened here yet.", { exact: false })).toBeVisible({ timeout: 30_000 });
});
