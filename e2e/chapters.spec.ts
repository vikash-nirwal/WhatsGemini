import { test, expect, openChat, sendMessage } from "./fixtures";
import type { Page } from "@playwright/test";

// "End chapter" (#4): the conversation so far becomes a titled chapter with
// a recap, shown in the chat and listed in the Scene panel, and the next
// reply is built from it instead of the whole history.

test.use({ seed: { messages: 6 } });

const chatAction = async (page: Page, name: string | RegExp) => {
  const direct = page.getByRole("button", { name });
  if (await direct.first().isVisible()) return direct.first().click();
  await page.getByRole("button", { name: /more/i }).last().click();
  await page.getByRole("menuitem", { name }).click();
  // The long menu leaves the pointer near the top, where the next toast
  // appears; a hovered toast never closes, and would cover the header.
  await page.mouse.move(1, (page.viewportSize()?.height || 800) - 1);
};

test("ending a chapter titles it, recaps it, and the next reply starts from it", async ({ page, mockAI }) => {
  mockAI.reply((req) =>
    req.stream
      ? "A fresh morning begins."
      : "TITLE: The Long Day\nRECAP: Aria and the user talked through a long, ordinary day.\nSUMMARY:\nStory so far: they talked about their day."
  );
  await openChat(page, 1);

  await chatAction(page, /End chapter/);
  await expect(page.getByText("Chapter 1: The Long Day")).toBeVisible();
  await expect(page.getByText("Aria and the user talked through a long, ordinary day.")).toBeVisible();

  // The chapter is listed in the Scene panel and can be renamed.
  await chatAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Story", exact: true }).click();
  await expect(page.getByText("1. The Long Day")).toBeVisible();
  await page.getByRole("button", { name: "Rename chapter 1" }).click();
  const title = page.getByLabel("Chapter title");
  await title.fill("A Quiet Beginning");
  await title.press("Enter");
  await expect(page.getByText("1. A Quiet Beginning")).toBeVisible();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  // The next reply gets the chapter summary, not the old messages.
  await sendMessage(page, "Good morning!");
  await expect(page.getByText("A fresh morning begins.")).toBeVisible();
  const sent = mockAI.requests.filter((r) => r.stream).pop()!;
  const history = sent.messages.map((m) => String(m.content)).join("\n");
  expect(history).toContain("Story so far: they talked about their day.");
  expect(history).not.toContain("Aria message 1: how was your day?");
});

test("a chapter or compression can be undone, and the AI reads the old messages again", async ({ page, mockAI }) => {
  mockAI.reply((req) =>
    req.stream
      ? "Back to where we were."
      : "TITLE: The Long Day\nRECAP: Aria and the user talked through a long, ordinary day.\nSUMMARY:\nStory so far: they talked about their day."
  );
  await openChat(page, 1);
  await chatAction(page, /End chapter/);
  await expect(page.getByText("Chapter 1: The Long Day")).toBeVisible();

  await page.getByRole("button", { name: "Undo this chapter" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Chapter 1: The Long Day")).toHaveCount(0);
  await expect(page.getByText("Aria message 1: how was your day?")).toBeVisible();

  await sendMessage(page, "Where were we?");
  await expect(page.getByText("Back to where we were.")).toBeVisible();
  const history = mockAI.requests.filter((r) => r.stream).pop()!.messages.map((m) => String(m.content)).join("\n");
  expect(history).toContain("Aria message 1: how was your day?");
  expect(history).not.toContain("Story so far");
});
