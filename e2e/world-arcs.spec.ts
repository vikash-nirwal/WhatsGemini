import { test, expect, openRoute } from "./fixtures";

// World arcs (#169): a storyline across a world, written from your idea,
// told in chapters you can move on, and kept in the world's timeline.

test.use({ seed: { messages: 2 } });

test("start a storyline, move it on, and end it", async ({ page, mockAI }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await openRoute(page, "/worlds");

  const section = page.getByRole("region", { name: "Storyline" });
  await section.getByRole("button", { name: "Start a storyline" }).click();
  const dialog = page.getByRole("dialog", { name: "Start a storyline" });
  await dialog.getByRole("textbox", { name: "Storyline idea" }).fill("a bell under the harbour");
  mockAI.reply("TITLE: The Drowned Bell\nBEAT: A bell rings under the harbour at night.\nBEAT: A rope is found cut clean.\nBEAT: The bell falls silent for good.");
  await dialog.getByRole("button", { name: "Write it" }).click();
  await expect(dialog.getByRole("list", { name: "Chapters" })).toContainText("A rope is found cut clean.");
  expect(mockAI.requests.pop()!.prompt).toContain("The author's idea for it: a bell under the harbour");
  await dialog.getByRole("button", { name: "Begin" }).click();

  await expect(section).toContainText("The Drowned Bell");
  await expect(section).toContainText("Now: A bell rings under the harbour at night.");
  await expect(section).toContainText("Chapter 1 of 3");
  await section.getByRole("button", { name: "Next chapter" }).click();
  await expect(section).toContainText("Now: A rope is found cut clean.");
  await section.getByRole("button", { name: "End storyline" }).click();
  await expect(section).toContainText('"The Drowned Bell" has ended.');

  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByRole("list", { name: "World timeline" });
  await expect(timeline).toContainText("The Drowned Bell began: A bell rings under the harbour at night.");
  await expect(timeline).toContainText("A rope is found cut clean.");
  await expect(timeline).toContainText("The Drowned Bell came to an end");
});
