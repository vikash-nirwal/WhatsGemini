import { test, expect, openChat, sendMessage, waitForReplyDone, messageBubble, headerAction } from "./fixtures";

// Choice moments in chats (#87): a turning point's options as tappable chips.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

test("a reply's options show as chips, and tapping one sends it", async ({ page, mockAI }) => {
  mockAI.replyOnce("*Thunder rolls outside.* The lights just went out.\n<<<CHOICES\n1. Light a candle\n2. Check the fuse box\nCHOICES>>>", "*You strike a match.* There, better.");
  await openChat(page);
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: "Options", exact: true }).click();
  await page.getByRole("switch", { name: "Choice moments" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await sendMessage(page, "What was that noise?");
  await expect(messageBubble(page, "The lights just went out.")).toBeVisible();
  await waitForReplyDone(page);
  await expect(messageBubble(page, "The lights just went out.")).not.toContainText("CHOICES");
  expect(systemOf(mockAI.requests[0].messages)).toContain("only at a real turning point");

  const choices = page.getByRole("group", { name: "Choices" });
  await choices.getByRole("button", { name: "Light a candle" }).click();
  await expect(messageBubble(page, "There, better.")).toBeVisible();
  expect(mockAI.requests[1].prompt).toContain("Light a candle");
  await expect(page.getByRole("group", { name: "Choices" })).toHaveCount(0);
});
