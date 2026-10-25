import { test, expect, openRoute } from "./fixtures";

// Channels (#127): follow a character's channel from Updates; it posts,
// shows as new, and you can react but not reply.

test.use({ seed: { messages: 4 } });

test("follow a channel, read its first post and react", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 9, 0, 0) });
  mockAI.reply((req) => (req.prompt.includes("runs a broadcast channel") ? "New shop hours: open till 9 this week! 🔧" : "Mock reply"));
  await openRoute(page, "/updates");
  const channels = page.getByRole("region", { name: "Channels" });
  await channels.getByRole("button", { name: "Find channels" }).click();
  await page.getByRole("button", { name: "Follow Aria's channel" }).click();
  await expect(page.getByRole("list", { name: "Channels to follow" })).toContainText("Following");
  await page.keyboard.press("Escape");

  await page.clock.fastForward(25_000);
  const row = channels.getByRole("button", { name: "Aria's channel, 1 new" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  const posts = page.getByRole("list", { name: "Posts" });
  await expect(posts).toContainText("New shop hours: open till 9 this week!");
  await expect(page.getByText("Only Aria posts here. You can react, or talk to Aria in your chat.")).toBeVisible();
  await expect(page.getByLabel("Message input")).toHaveCount(0);

  await posts.getByRole("button", { name: "React" }).click();
  await page.getByRole("menuitem", { name: "React with 🙏" }).click();
  await expect(posts.locator("span").filter({ hasText: /^🙏 \d+$/ })).toHaveClass(/border-primary/);
  await page.goto("./#/updates");
  await expect(channels.getByRole("button", { name: "Aria's channel" })).toBeVisible();
});
