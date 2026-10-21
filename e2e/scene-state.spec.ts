import { test, expect, openChat, headerAction, sendMessage, waitForReplyDone, messageBubble } from "./fixtures";

// Scene state HUD (#9): with the tracker on, a reply's hidden <state> block
// updates a strip under the header and is fed back on the next turn.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

test("the tracker shows the scene's state and keeps the model consistent", async ({ page, mockAI }) => {
  await openChat(page);
  await headerAction(page, "Scene & chat settings");
  await page.getByRole("switch", { name: "Track the scene" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  const strip = page.getByRole("group", { name: "Scene state" });
  await expect(strip).toContainText("shows here after the next reply");

  mockAI.reply("*She hands you a coffee.* Rough morning?\n<state>location: the corner cafe; time: morning; outfit: green sweater; affection: 58; trust: 44</state>");
  await sendMessage(page, "Hey, sorry I'm late");
  await expect(messageBubble(page, "Rough morning?")).toBeVisible();
  await waitForReplyDone(page);
  await expect(messageBubble(page, "Rough morning?")).not.toContainText("<state>");
  await expect(strip).toContainText("the corner cafe");
  await expect(strip).toContainText("morning");
  await expect(strip).toContainText("green sweater");
  await expect(strip.getByTitle("Affection: 58 of 100")).toBeVisible();
  expect(systemOf(mockAI.requests[0].messages)).toContain("Keep track of the scene's state");

  mockAI.reply("Let's walk to the park.\n<state>location: the park; affection: 61</state>");
  await sendMessage(page, "Want to take a walk?");
  await expect(strip).toContainText("the park");
  expect(systemOf(mockAI.requests[1].messages)).toContain("The state right now: location: the corner cafe; time: morning; outfit: green sweater; affection: 58; trust: 44.");
  // What a reply leaves out stays as it was.
  await expect(strip).toContainText("green sweater");
  await expect(strip.getByTitle("Affection: 61 of 100")).toBeVisible();
});
