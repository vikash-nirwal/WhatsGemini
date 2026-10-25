import { test, expect, openRoute, sendMessage, waitForReplyDone } from "./fixtures";

// Story time (#147): a world's own calendar, set in the world editor and
// moved by time skips, replaces your clock in replies set there.

test.use({ seed: { messages: 4 } });

test("a world's calendar is set, skipped ahead, and used in replies", async ({ page, mockAI }) => {
  mockAI.reply("Mock reply");
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port.");
  await page.getByText("This world has its own calendar").click();
  await page.getByLabel("Years are called").fill("Year");
  await page.getByLabel("Year", { exact: true }).fill("312");
  await page.getByLabel("Months").fill("Thaw, Sowing, Harvest month, Frost");
  await page.getByLabel("Months").blur();
  await page.getByLabel("Days a month").fill("10");
  await page.getByRole("combobox", { name: "Month" }).click();
  await page.getByRole("option", { name: "Harvest month" }).click();
  await page.getByLabel("Day", { exact: true }).fill("4");
  await page.getByText("Moves with real time").click();
  await expect(page.getByText("Today here: Year 312, Harvest month, day 4")).toBeVisible();
  await page.getByRole("button", { name: "A week" }).click();
  await expect(page.getByText("Today here: Year 312, Frost, day 1")).toBeVisible();
  await page.getByRole("button", { name: "Create World" }).click();
  await expect(page.getByText("Today here: Year 312, Frost, day 1")).toBeVisible();

  // Aria joins, and her reply there is told the world's date, not yours.
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await openRoute(page, "/characters");
  await page.getByRole("button", { name: "From another world" }).click();
  await page.getByRole("button", { name: "Add Aria" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Chat", exact: true }).first().click();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await sendMessage(page, "what day is it?");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("In-world date in Harbour Town: Year 312, Frost, day 1.");
  expect(system).not.toContain("Real-world time for the user");
});
