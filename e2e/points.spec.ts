import { test, expect, openRoute, openChat, openContactInfo, sendMessage, waitForReplyDone, chatMessages } from "./fixtures";

// Points (#234): with a world's switch on, characters score you and each
// other 0-10 per trait; replies hear it and move it with a hidden tag, and
// Contact info shows each score as a slider you can set.

test.use({ seed: { messages: 2 } });

test("points are switched on per world, moved by a reply and set by hand", async ({ page, mockAI }) => {
  await openRoute(page, "/worlds");
  const life = page.getByRole("group", { name: "Life in Default" });
  await life.getByText("Points toward you and each other").click();
  const traits = page.getByRole("group", { name: "Traits in Default" });
  await expect(traits).toContainText("affection");
  await traits.getByLabel("New trait").fill("Loyalty");
  await traits.getByLabel("New trait").press("Enter");
  await expect(traits).toContainText("loyalty");

  await openChat(page);
  await openContactInfo(page);
  const trust = page.getByRole("slider", { name: /^Aria's trust toward/ });
  await expect(trust).toBeVisible();
  await expect(page.getByRole("slider", { name: /^Aria's loyalty toward/ })).toHaveValue("5");
  const before = Number(await trust.inputValue());
  await page.getByRole("button", { name: "Close contact info" }).click();

  mockAI.reply("Okay. I believe you. [Points: trust +2]");
  await sendMessage(page, "I promise I'll be there.");
  await waitForReplyDone(page);
  await expect(chatMessages(page).getByText("Okay. I believe you.")).toBeVisible();
  await expect(chatMessages(page)).not.toContainText("[Points");
  const system = mockAI.requests.filter((r) => r.stream).pop()?.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("How you feel, on a 0-10 scale for affection, trust, respect, attraction, rivalry, loyalty");

  await openContactInfo(page);
  await expect(trust).toHaveValue(String(Math.min(10, before + 2)));
  await expect(page.getByRole("group", { name: "Aria's points" })).toContainText("Last moved: when they said");

  // By hand: a step down with the keyboard, kept after a reload.
  await trust.focus();
  await page.keyboard.press("ArrowLeft");
  const set = String(Math.min(10, before + 2) - 0.5);
  await expect(trust).toHaveValue(set);
  await page.reload();
  await openContactInfo(page);
  await expect(page.getByRole("slider", { name: /^Aria's trust toward/ })).toHaveValue(set);
});

test("without the switch there are no points", async ({ page }) => {
  await openChat(page);
  await openContactInfo(page);
  await expect(page.getByRole("slider", { name: /trust toward/ })).toHaveCount(0);
});
