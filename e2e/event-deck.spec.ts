import { test, expect, openChat, openRoute, headerAction, messageBubble } from "./fixtures";

// Event deck (#49): drawing a card makes the next reply work that event in.

test.use({ seed: { messages: 4 }, localStorageOverrides: { event_deck: JSON.stringify(["The lights go out"]) } });

test("drawing an event card brings it into the next reply", async ({ page, mockAI }) => {
  mockAI.reply("*The room plunges into darkness.* Did you do that?");
  await openChat(page);
  await headerAction(page, "Draw an event card (a random event happens)");
  await expect(page.getByText("You drew: The lights go out")).toBeVisible();
  await expect(messageBubble(page, "Did you do that?")).toBeVisible();
  expect(JSON.stringify(mockAI.requests[0].messages)).toContain('work it into the scene naturally and in character: \\"The lights go out\\"');
});

test("the deck is edited in Settings and can be reset", async ({ page }) => {
  await openRoute(page, "/settings/chat");
  const deck = page.getByLabel("Event deck");
  await expect(deck).toHaveValue("The lights go out");
  await deck.fill("A dragon lands\nThe tavern burns");
  await deck.blur();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("event_deck"))).toBe(JSON.stringify(["A dragon lands", "The tavern burns"]));
  await page.getByRole("button", { name: "Reset to the built-in deck" }).click();
  await expect(deck).toHaveValue(/^A sudden downpour starts\n/);
  expect(await page.evaluate(() => localStorage.getItem("event_deck"))).toBeNull();
});
