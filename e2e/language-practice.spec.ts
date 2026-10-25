import type { Page } from "@playwright/test";
import { test, expect, openChat, sendMessage, waitForReplyDone, messageBubble, headerAction, messageAction } from "./fixtures";

// Language practice (#67): replies in the language you're learning, a
// correction under your message, and a translation on request.

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";
const isTouch = (page: Page) => page.evaluate(() => window.matchMedia("(hover: none)").matches);

test("replies come in Spanish, your mistakes get corrected, and a reply can be translated", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.startsWith("Translate this message into") ? "How nice! Why are you so happy?" : "¡Qué bien! ¿Por qué estás tan feliz?\n<fix>Yo soy feliz - \"ser\", not \"es\", with yo</fix>"));
  await openChat(page);
  await headerAction(page, "Scene & story");
  await page.getByRole("tab", { name: "Options", exact: true }).click();
  await page.getByRole("combobox", { name: "Practice language" }).click();
  await page.getByRole("option", { name: "Spanish", exact: true }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await sendMessage(page, "Yo es feliz hoy");
  const reply = messageBubble(page, "¡Qué bien!");
  await expect(reply).toBeVisible();
  await waitForReplyDone(page);
  await expect(reply).not.toContainText("<fix>");
  await expect(page.getByLabel("Correction")).toContainText('Yo soy feliz - "ser", not "es", with yo');
  expect(systemOf(mockAI.requests[0].messages)).toContain("practising Spanish");

  if (await isTouch(page)) {
    await reply.dispatchEvent("contextmenu");
    await page.getByRole("menuitem", { name: "Translate" }).click();
  } else {
    await reply.hover();
    await messageAction(page, reply, "Translate");
  }
  await expect(page.getByLabel("Translation")).toContainText("How nice! Why are you so happy?");
});
