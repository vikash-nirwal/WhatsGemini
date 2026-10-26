import { test, expect, openRoute } from "./fixtures";

// World events (#162): you can start one in the current world, from a line
// with AI help; it shows on the Worlds page and in the timeline, and ends
// when you say so.

test.use({ seed: { messages: 2 } });

test("start a world event with AI help, see it, and end it", async ({ page, mockAI }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await openRoute(page, "/worlds");

  const section = page.getByRole("region", { name: "World events" });
  await expect(section).toContainText("Nothing special.");
  await section.getByRole("button", { name: "Start an event" }).click();
  const dialog = page.getByRole("dialog", { name: "Start an event" });
  await dialog.getByRole("textbox", { name: "Event name" }).fill("a storm");
  mockAI.reply("TITLE: The Long Storm\nWHAT: A gale has kept every boat in the harbour.\nDAYS: 2");
  await dialog.getByRole("button", { name: "Flesh it out" }).click();
  await expect(dialog.getByRole("textbox", { name: "Event name" })).toHaveValue("The Long Storm");
  expect(mockAI.requests.pop()!.prompt).toContain("The author wants this to happen: a storm");
  await expect(dialog.getByRole("spinbutton", { name: "Days it lasts" })).toHaveValue("2");
  await dialog.getByRole("button", { name: "Make it happen" }).click();

  await expect(section).toContainText("The Long Storm");
  await expect(section).toContainText("A gale has kept every boat in the harbour.");
  await expect(section).toContainText("2 more days");

  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("list", { name: "World timeline" })).toContainText("The Long Storm: A gale has kept every boat in the harbour.");
  await page.goBack();

  await section.getByRole("button", { name: "End The Long Storm" }).click();
  await expect(section).toContainText("Nothing special.");
});
