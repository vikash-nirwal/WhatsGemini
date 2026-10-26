import { test, expect, openChat, headerAction, sendMessage, waitForReplyDone, chatMessages } from "./fixtures";

// Pass the time: hours to years go by since you last talked, and the
// characters act like it - texting first if you like, and their replies
// know how long it's been for the next few exchanges.

test.use({ seed: { messages: 4 } });

test("three years pass: a marker, they reach out first, and replies know how long it's been", async ({ page, mockAI }) => {
  mockAI.reply("Wow. Three years. I moved to Porto, you know.");
  await openChat(page);
  await headerAction(page, "Pass the time");
  const dialog = page.getByRole("dialog", { name: "Pass the time" });
  await dialog.getByLabel("How long").fill("3");
  await dialog.getByRole("radio", { name: "years" }).click();
  await dialog.getByLabel("What happened meanwhile").fill("she moved to Porto and you never wrote");
  await dialog.getByRole("button", { name: "Pass 3 years" }).click();
  await expect(dialog).toBeHidden();

  await expect(chatMessages(page).getByText("⏳ 3 years later")).toBeVisible();
  await expect(chatMessages(page).getByText("Wow. Three years.")).toBeVisible({ timeout: 15_000 });
  const opener = mockAI.requests.filter((r) => r.stream)[0];
  expect(JSON.stringify(opener.messages)).toContain("3 years have passed since your last conversation");
  await waitForReplyDone(page);

  await sendMessage(page, "I missed you");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("3 years have passed in the story since you and");
  expect(system).toContain("Meanwhile: she moved to Porto and you never wrote.");
});

test("a few hours pass quietly when they don't text first", async ({ page, mockAI }) => {
  mockAI.reply("Hey, back already?");
  await openChat(page);
  await headerAction(page, "Pass the time");
  const dialog = page.getByRole("dialog", { name: "Pass the time" });
  await dialog.getByLabel("How long").fill("4");
  await dialog.getByRole("radio", { name: "hours" }).click();
  await dialog.getByText("They text first").click();
  await dialog.getByRole("button", { name: "Pass 4 hours" }).click();
  await expect(chatMessages(page).getByText("⏳ 4 hours later")).toBeVisible();
  expect(mockAI.requests.filter((r) => r.stream)).toHaveLength(0);
  await sendMessage(page, "hey");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("4 hours have passed");
  expect(system).toContain("pick up where you left off");
});
