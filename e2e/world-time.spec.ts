import { test, expect, openRoute, openChat, chatMessages } from "./fixtures";

// Pass the time for a whole world (the user's ask, 2026-10-26): every chat
// there gets the gap, and the people you talk to most text first.

test.use({ seed: { messages: 3, room: true } });

test("time passes for the whole world, and someone texts first", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.includes("have passed since your last conversation") ? "hey stranger. two weeks, huh?" : "Mock reply"));
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Pass the time" }).click();
  const dialog = page.getByRole("dialog", { name: "Pass the time in My world" });
  await dialog.getByRole("spinbutton", { name: "How long" }).fill("2");
  await dialog.getByRole("radio", { name: "weeks" }).click();
  await dialog.getByRole("textbox", { name: "What happened meanwhile" }).fill("a storm cut the power");
  await dialog.getByRole("button", { name: "Pass 2 weeks" }).click();
  await expect(page.getByText("2 weeks later in My world · 1 texted you")).toBeVisible();
  expect(mockAI.requests.find((r) => r.prompt.includes("have passed since"))!.prompt).toContain("meanwhile: a storm cut the power");

  await openChat(page, 1);
  await expect(page.getByText("⏳ 2 weeks later")).toBeVisible();
  await expect(chatMessages(page).getByText("hey stranger. two weeks, huh?")).toHaveCount(1);
  await openChat(page, 2);
  await expect(page.getByText("⏳ 2 weeks later")).toBeVisible();

  await openRoute(page, "/worlds/mine/timeline");
  await expect(page.getByRole("list", { name: "World timeline" })).toContainText("2 weeks passed for everyone: a storm cut the power");
});
