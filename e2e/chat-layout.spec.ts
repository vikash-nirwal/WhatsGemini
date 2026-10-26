import { test, expect, openChat, openContactInfo, sendMessage, waitForReplyDone } from "./fixtures";

// The chat never shifts up and leaves a blank strip below it: the boxes
// around the message list can't be scrolled by new messages, focus, or
// scrollIntoView inside them.

test.use({ seed: { messages: 30 }, viewport: { width: 2000, height: 1150 } });

const outerScroll = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const pane = document.querySelector('[data-slot="chat-pane"]') as HTMLElement;
    const shifted: number[] = [];
    // Try what focus or scrollIntoView would do to each box around it.
    for (let el = pane as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
      el.scrollTop = 300;
      if (el.scrollTop) shifted.push(el.scrollTop);
    }
    const rect = pane.getBoundingClientRect();
    // The side panel scrolls inside itself instead of stretching the chat.
    const panel = document.querySelector('[data-slot="side-panel"]') as HTMLElement | null;
    return { shifted, gapBelow: Math.round(window.innerHeight - rect.bottom), paneBelowScreen: Math.round(rect.bottom - window.innerHeight), panelTaller: panel ? panel.offsetHeight > window.innerHeight : false };
  });

test("new messages and focusing the side panel don't push the chat up", async ({ page, mockAI }) => {
  mockAI.reply("A reply long enough to wrap.\n\nAnd a second paragraph so it is tall.");
  await openChat(page);
  for (const text of ["one", "two"]) {
    await sendMessage(page, text);
    await waitForReplyDone(page);
  }
  await openContactInfo(page);
  // Focus the last field in the panel, which used to scroll the boxes around it.
  await page.getByRole("button", { name: /Block Aria/ }).focus();
  await page.evaluate(() => document.querySelector('[data-slot="chat-pane"] [data-message-id]:last-of-type')?.scrollIntoView({ block: "end" }));
  const { shifted, gapBelow, paneBelowScreen, panelTaller } = await outerScroll(page);
  expect(shifted).toEqual([]);
  expect(paneBelowScreen).toBeLessThanOrEqual(0);
  expect(panelTaller).toBe(false);
  // On phones the tab bar can sit below the chat; never a big blank strip.
  expect(gapBelow).toBeLessThan(100);
});
