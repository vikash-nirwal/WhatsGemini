import type { Page } from "@playwright/test";
import { test, expect, openRoute, headerAction, adventureReply, ADVENTURE_CHOICES, ADVENTURE_OPENING } from "./fixtures";

// Adventures as games (#25-#27): the app keeps stats, inventory and quests
// from the narrator's reported changes; risky choices carry a skill check the
// app rolls with the persona's character sheet.

test.use({ seed: { adventure: true } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

const openAdventure = async (page: Page) => {
  await openRoute(page, "/adventures/1");
  await expect(page.getByText(ADVENTURE_OPENING)).toBeVisible({ timeout: 30_000 });
};

// The side panel from 768px up; on phones a summary button opens it.
const statsPanel = async (page: Page) => {
  const open = page.getByRole("button", { name: "Show stats, inventory and quests" });
  if (await open.isVisible()) await open.click();
  return page.getByRole("region", { name: "Stats, inventory and quests" }).locator("visible=true");
};

test("the narrator's changes update stats, inventory and quests, and the app keeps them", async ({ page, mockAI }) => {
  await openAdventure(page);
  await headerAction(page, "Stats, inventory and quests: off");

  mockAI.replyOnce(
    adventureReply("You find a rusty key under a soggy book, and a few coins.\n<<<STATS\ngain: rusty key\ngold: +5\nhp: -2\nquest: Find the map\nSTATS>>>", ["Try the key", "Keep searching"])
  );
  await page.getByRole("button", { name: ADVENTURE_CHOICES[0].label }).click();
  await expect(page.getByText("You find a rusty key under a soggy book")).toBeVisible();
  await expect(page.getByText("<<<STATS")).toHaveCount(0);
  const changes = page.getByRole("list", { name: "What changed" });
  await expect(changes).toContainText("+ rusty key");
  await expect(changes).toContainText("+5 gold");
  await expect(changes).toContainText("−2 HP");
  expect(systemOf(mockAI.requests[0].messages)).toContain("HP 10/10\ngold 0\nitems: none");

  const panel = await statsPanel(page);
  await expect(panel).toContainText("8 / 10");
  await expect(panel).toContainText("rusty key");
  await expect(panel).toContainText("Find the map");
  await page.keyboard.press("Escape");

  // Losing what you don't have does nothing; the next turn sees the new state.
  mockAI.replyOnce(adventureReply("You swing at nothing.\n<<<STATS\nlose: laser sword\nSTATS>>>", ["Wait"]));
  await page.getByRole("button", { name: "Keep searching" }).click();
  await expect(page.getByText("You swing at nothing.")).toBeVisible();
  expect(systemOf(mockAI.requests[1].messages)).toContain("HP 8/10\ngold 5\nitems: rusty key\nactive quests: Find the map");
  await expect(page.getByRole("list", { name: "What changed" })).toHaveCount(1);
});

test.describe("skill checks", () => {
  test.use({
    localStorageOverrides: {
      whatsgemini_user_personas: JSON.stringify([{ id: "p1", name: "Vik", bio: "", skills: [{ name: "Dexterity", modifier: 3 }] }]),
      whatsgemini_active_persona_id: JSON.stringify("p1"),
    },
  });

  test("a risky choice is rolled with the persona's skill and the narrator is told the outcome", async ({ page, mockAI }) => {
    // Every d20 comes up 11.
    await page.addInitScript(() => {
      Math.random = () => 0.5;
    });
    await openAdventure(page);
    await headerAction(page, "Skill checks: off");

    mockAI.replyOnce(adventureReply("A locked door blocks the stacks.", ["Pick the lock [Dexterity DC 14]", "Knock"]));
    await page.getByRole("button", { name: ADVENTURE_CHOICES[0].label }).click();
    const pick = page.getByRole("button", { name: /Pick the lock/ });
    await expect(pick).toContainText("Dexterity DC 14");
    expect(systemOf(mockAI.requests[0].messages)).toContain("Skills: Dexterity +3.");
    expect(systemOf(mockAI.requests[0].messages)).toContain("end its line with a skill check in square brackets");

    mockAI.replyOnce(adventureReply("The lock clicks open.", ["Go in"]));
    await pick.click();
    await expect(page.getByText("Dexterity 11 + 3 = 14 vs DC 14: success")).toBeVisible();
    await expect(page.getByText("The lock clicks open.")).toBeVisible();
    expect(mockAI.requests[1].prompt).toBe("Pick the lock\n\n(Skill check, Dexterity: rolled 11 + 3 = 14 against DC 14. Success: narrate the outcome as a success.)");
  });
});

test("a persona gets a character sheet in Settings", async ({ page }) => {
  await openRoute(page, "/settings/profile");
  await page.getByRole("button", { name: "Add persona" }).click();
  await page.getByText("Character sheet").click();
  await page.getByRole("button", { name: "Start from the basics" }).click();
  const dex = page.getByRole("group", { name: "Dexterity" });
  await dex.getByLabel("Modifier").fill("4");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("whatsgemini_user_personas"))).toContain('{"name":"Dexterity","modifier":4}');
});

test.describe("set up in the wizard", () => {
  test.use({ seed: {} });

  test("stats, starting items and skill checks are chosen up front, and typed actions get rolled", async ({ page, mockAI }) => {
    // Every d20 comes up 11.
    await page.addInitScript(() => {
      Math.random = () => 0.5;
    });
    await openRoute(page, "/adventures/new");
    const next = page.getByRole("button", { name: "Next", exact: true });
    await next.click();
    await next.click();
    await page.locator("#adv-title").fill("Map Run");
    await next.click();
    // No automatic illustrations, so no image request takes a queued reply.
    await page.getByText("Illustrate every scene automatically").click();
    await page.getByText("Play it as a game with stats").click();
    await page.getByLabel("Starting gold").fill("7");
    await page.getByPlaceholder("e.g. lantern").fill("lantern");
    await page.getByPlaceholder("e.g. lantern").press("Enter");
    await page.getByText("Roll for risky actions").click();
    await next.click();
    await expect(page.getByText("stats from 10 HP, 7 gold, lantern; skill checks")).toBeVisible();

    mockAI.replyOnce(adventureReply("A rope bridge sways over a gorge.", ["Cross carefully", "Look for another way"]));
    await page.getByRole("button", { name: "Start Adventure" }).click();
    await expect(page.getByText("A rope bridge sways over a gorge.")).toBeVisible({ timeout: 30_000 });
    const system = systemOf(mockAI.requests.find((r) => r.messages.some((m) => m.role === "system"))!.messages);
    expect(system).toContain("HP 10/10\ngold 7\nitems: lantern");
    expect(system).toContain("end its line with a skill check in square brackets");

    mockAI.replyOnce(adventureReply("You leap the gap and land on the far side.\n[Check: Dexterity DC 10]", ["Keep going"]));
    await page.getByPlaceholder(/What do you do\?/).fill("I jump the gap");
    await page.getByRole("button", { name: "Send action" }).click();
    await expect(page.getByText("You leap the gap and land on the far side.")).toBeVisible();
    const turn = mockAI.requests.find((r) => r.prompt.startsWith("I jump the gap"));
    expect(turn?.prompt).toContain("I jump the gap\n\n(Dice for this action, if it needs them: the d20 came up 11.");
    await expect(page.getByText("Dexterity 11 vs DC 10: success")).toBeVisible();
    await expect(page.getByText("[Check:")).toHaveCount(0);
  });
});
