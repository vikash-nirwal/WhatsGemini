import { test, expect, openChat, openRoute, sendMessage, adventureReply } from "./fixtures";

// Story play: paste a story, take a part in it and the AI narrates and
// voices everyone else, with no Character made. And in a chat's story
// script, the story's people can be renamed and voiced by the character.

test.use({ seed: { messages: 0 } });

const systemPrompt = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

const DRAFT = {
  premise: "Lizzy Bennet meets proud Mr Darcy at a ball in Meryton.",
  beats: Array.from({ length: 14 }, (_, i) => (i === 0 ? "Lizzy overhears Darcy's insult." : `Event ${i + 1}`)),
  cast: [{ name: "Lizzy Bennet", about: "Witty second daughter." }, { name: "Darcy", about: "Proud and rich." }, { name: "Jane", about: "Lizzy's kind sister." }],
  directions: "Regency manners.",
  ending: "They marry.",
};

test("a pasted story is played as one of its own people, with more than ten beats", async ({ page, mockAI }) => {
  await openRoute(page, "/stories");
  await expect(page.getByText("No stories yet.")).toBeVisible();
  await page.getByRole("button", { name: "Play a story" }).click();

  mockAI.replyOnce(JSON.stringify(DRAFT));
  await page.getByLabel("Story to play").fill("It is a truth universally acknowledged... (a long story)");
  await page.getByRole("button", { name: "Read the story" }).click();

  // The main character is picked; pick Jane instead, and rename Lizzy.
  const parts = page.getByRole("radiogroup", { name: "Who you play" });
  await expect(parts.getByRole("radio", { name: "Lizzy Bennet" })).toHaveAttribute("aria-checked", "true");
  await parts.getByRole("radio", { name: "Jane" }).click();
  await expect(parts.getByRole("radio", { name: "Jane" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Name of story character 1").fill("Eliza Bennet");
  await expect(page.getByText("14 beats")).toBeVisible();
  await page.getByPlaceholder("Name this story").fill("Meryton");

  mockAI.reply(adventureReply('**Darcy:** "She is tolerable."\n**Eliza:** "How rude."', ["Comfort Eliza", "Glare at Darcy"]));
  await page.getByRole("button", { name: "Start playing" }).click();
  await expect(page.getByText("She is tolerable.")).toBeVisible();
  await expect(page.getByText("Playing Jane")).toBeVisible();

  const prompt = systemPrompt(mockAI.requests[1].messages);
  expect(prompt).toContain("The player plays Jane, one of the story's own characters");
  expect(prompt).toContain("Premise: Eliza Bennet meets proud Mr Darcy");
  expect(prompt).toContain("Current beat: Eliza overhears Darcy's insult.");
  expect(prompt).toContain("you're on beat 1");
  expect(prompt).toContain("told in 14 beats");
  expect(prompt).not.toContain("Lizzy");

  // It lives under Stories, not Adventures.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/stories$/);
  await expect(page.getByRole("list", { name: "Stories" })).toContainText("You play Jane");
  await openRoute(page, "/adventures");
  await expect(page.getByText("Meryton")).toHaveCount(0);
});

test("in a chat, the story's people can be renamed and voiced alongside the character", async ({ page, mockAI }) => {
  await openChat(page);
  mockAI.replyOnce(JSON.stringify(DRAFT));
  await page.getByRole("button", { name: "Write the story" }).click();
  const dialog = page.getByRole("dialog", { name: "Story script" });
  await dialog.getByText("Paste a story or script").click();
  await dialog.getByLabel("Story to split into beats").fill("A long story.");
  await dialog.getByRole("button", { name: "Split into beats" }).click();
  await expect(dialog.getByLabel("Beat 14", { exact: true })).toBeVisible();

  await dialog.getByLabel("Name of story character 1").fill("Eliza Bennet");
  await dialog.getByLabel("Who plays Eliza Bennet").click();
  await page.getByRole("option", { name: "You play them" }).click();
  await dialog.getByLabel("Who plays Darcy").click();
  await page.getByRole("option", { name: /plays them$/ }).filter({ hasNotText: /^(The AI|You) / }).click();
  await dialog.getByRole("button", { name: "Save script" }).click();
  await expect(dialog).toBeHidden();

  mockAI.reply("Hello.");
  await sendMessage(page, "Good evening.");
  await expect.poll(() => mockAI.requests.length).toBeGreaterThanOrEqual(2);
  const prompt = systemPrompt(mockAI.requests[1].messages);
  expect(prompt).toContain("- Eliza Bennet (the user plays them): Witty second daughter.");
  expect(prompt).toMatch(/- Darcy \(you, \w+, play them\)/);
  expect(prompt).toContain("you voice the story's other characters (Jane)");
  expect(prompt).toContain("Current beat: Eliza overhears Darcy's insult.");
  expect(prompt).not.toContain("Lizzy");
});
