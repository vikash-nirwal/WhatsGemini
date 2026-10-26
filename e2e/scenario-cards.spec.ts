import { test, expect, openChat, headerAction, waitForReplyDone, messageBubble } from "./fixtures";

// Scenario cards (#79) and time skips (#80).

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

test("a scenario card sets the scene and the character opens it", async ({ page, mockAI }) => {
  mockAI.reply("*She spots you and waves.* You made it!");
  await openChat(page);
  await headerAction(page, "Scenario cards");
  const cards = page.getByRole("dialog", { name: "Scenario cards" });
  await cards.getByRole("button", { name: /Date night/ }).click();
  await expect(cards).toBeHidden();
  await expect(page.getByText("A small candlelit restaurant on a quiet street")).toBeVisible();
  await expect(messageBubble(page, "You made it!")).toBeVisible();
  await waitForReplyDone(page);
  expect(systemOf(mockAI.requests[0].messages)).toContain("A new scene starts now. A small candlelit restaurant");
});

test("a time skip writes a transition, moves the tracked time and place on, and the story continues", async ({ page, mockAI }) => {
  mockAI.reply((req) =>
    req.prompt.includes("Write the short scene transition for a time skip")
      ? "NARRATION: Morning light spills across the kitchen.\nTIME: early morning\nPLACE: the kitchen"
      : "Coffee? *She slides a mug over.*"
  );
  await openChat(page);
  await headerAction(page, "Scene & story");
  await page.getByRole("switch", { name: "Track the scene" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await headerAction(page, "Pass the time");
  await page.getByRole("dialog", { name: "Pass the time" }).getByRole("button", { name: "The next morning..." }).click();
  await expect(page.getByText("Morning light spills across the kitchen.")).toBeVisible();
  await expect(messageBubble(page, "Coffee?")).toBeVisible();
  const strip = page.getByRole("group", { name: "Scene state" });
  await expect(strip).toContainText("the kitchen");
  await expect(strip).toContainText("early morning");
});
