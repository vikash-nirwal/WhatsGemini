import type { Page } from "@playwright/test";
import { test, expect, openChat, messageBubble, chatMessages } from "./fixtures";

// Fork into a new chat (#86): a new chat that starts at the chosen message.

test.use({ seed: { messages: 6 } });

const isTouch = (page: Page) => page.evaluate(() => window.matchMedia("(hover: none)").matches);

test("a new chat starts from a message, and the original stays as it was", async ({ page }) => {
  await openChat(page);
  const bubble = messageBubble(page, "Aria message 3: how was your day?");
  if (await isTouch(page)) {
    await bubble.dispatchEvent("contextmenu");
    await page.getByRole("menuitem", { name: "Start a new chat from here" }).click();
  } else {
    await bubble.hover();
    await bubble.getByRole("button", { name: "Start a new chat from here" }).click();
  }
  await expect(page).toHaveURL(/#\/chat\/(?!1$)\d+$/);
  await expect(chatMessages(page).getByText("Aria message 3: how was your day?")).toBeVisible();
  await expect(chatMessages(page).getByText("User message 4: it was fine, thanks.")).toHaveCount(0);

  await page.goto("./#/chat/1");
  await expect(chatMessages(page).getByText("User message 6: it was fine, thanks.")).toBeVisible({ timeout: 30_000 });
});
