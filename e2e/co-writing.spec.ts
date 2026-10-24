import { test, expect, openChat, sendMessage, waitForReplyDone, headerAction, chatMessages } from "./fixtures";

// Co-writing mode (#68): one shared story, shown as a document, with ideas
// for what happens next.

test.use({ seed: { messages: 2 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

test("the chat becomes one shared story, and ideas for what happens next fill the box", async ({ page, mockAI }) => {
  mockAI.reply((req) =>
    req.prompt.includes("could happen next")
      ? "1. A stranger boards at midnight\n2. The lights go out\n3. She finds a letter"
      : "The train slowed as the snow thickened, and somewhere ahead a whistle cried out."
  );
  await openChat(page);
  await headerAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page.getByRole("switch", { name: "Co-writing mode" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await expect(page.getByLabel("Message input")).toHaveAttribute("placeholder", "Write the next part of the story…");
  await sendMessage(page, "The night train left Vienna an hour late.");
  await expect(chatMessages(page).getByText("somewhere ahead a whistle cried out")).toBeVisible();
  await waitForReplyDone(page);
  await expect(page.locator('[data-slot="story-paragraph"]')).toHaveCount(4);
  await expect(page.locator('[data-slot="message-bubble"]')).toHaveCount(0);
  expect(systemOf(mockAI.requests[0].messages)).toContain("are co-writing a story together");

  await page.getByRole("button", { name: "What happens next?" }).click();
  const ideas = page.getByRole("group", { name: "Reply suggestions" });
  await ideas.getByRole("button", { name: "The lights go out" }).click();
  await expect(page.getByLabel("Message input")).toHaveValue("The lights go out");
});
