import type { Page } from "@playwright/test";
import { test, expect, openChat, sendMessage, waitForReplyDone, messageBubble, ARIA } from "./fixtures";

// Inner thoughts (#10) and reactions (#11): the control tags are stripped
// from the reply and kept on the message, thoughts are revealed on tap and
// never sent back, and reactions go both ways.

test.use({ seed: { messages: 3 } });

const isTouch = (page: Page) => page.evaluate(() => window.matchMedia("(hover: none)").matches);

const enableThoughts = async (page: Page) => {
  await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("characters", "readwrite");
      const store = tx.objectStore("characters");
      const get = store.get(id);
      get.onsuccess = () => store.put({ ...get.result, innerThoughts: true });
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, ARIA.id);
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
};

test("a reply's thoughts are hidden until tapped, and its reaction lands on your message", async ({ page, mockAI }) => {
  mockAI.reply("[React: ❤️]\n[Emotion: happy]\nThat's wonderful news!\n<thoughts>I knew they could do it.</thoughts>");
  await openChat(page);
  await enableThoughts(page);

  await sendMessage(page, "I passed my exam!");
  const reply = messageBubble(page, "That's wonderful news!");
  await expect(reply).toBeVisible();
  await waitForReplyDone(page);
  await expect(reply).not.toContainText("<thoughts>");
  await expect(reply).not.toContainText("[React");
  await expect(page.getByText("I knew they could do it.")).toBeHidden();

  await reply.getByRole("button", { name: "💭 Inner thoughts" }).click();
  await expect(reply.getByText("I knew they could do it.")).toBeVisible();

  await expect(messageBubble(page, "I passed my exam!").getByRole("button", { name: "Who reacted: Aria reacted ❤️" })).toBeVisible();

  // The thoughts directive was sent; the thought itself never goes back.
  expect(mockAI.requests[0].messages[0].content).toContain("<thoughts>...</thoughts>");
  await sendMessage(page, "Thanks!");
  await expect.poll(() => mockAI.requests.length).toBe(2);
  expect(JSON.stringify(mockAI.requests[1].messages)).not.toContain("I knew they could do it.");
});

test("your reaction shows on the reply and the character is told about it", async ({ page, mockAI }) => {
  mockAI.reply("Glad you liked it.");
  await openChat(page);
  const reply = messageBubble(page, "Aria message 3: how was your day?");

  if (await isTouch(page)) {
    await reply.dispatchEvent("contextmenu");
    await page.getByRole("group", { name: "React" }).getByRole("button", { name: "React with 😂" }).click();
  } else {
    await reply.hover();
    await reply.getByRole("button", { name: "React", exact: true }).click();
    await page.getByRole("menuitem", { name: "React with 😂" }).click();
  }
  await expect(reply.getByRole("button", { name: "Who reacted: You reacted 😂" })).toBeVisible();

  await sendMessage(page, "Ha, anyway.");
  await expect.poll(() => mockAI.requests.length).toBe(1);
  expect(mockAI.requests[0].prompt).toContain('[The user reacted 😂 to: "Aria message 3: how was your day?"]');

  // Picking the same emoji again takes it back.
  await waitForReplyDone(page);
  if (await isTouch(page)) {
    await reply.dispatchEvent("contextmenu");
    await page.getByRole("group", { name: "React" }).getByRole("button", { name: "Remove 😂 reaction" }).click();
  } else {
    await reply.hover();
    await reply.getByRole("button", { name: "React", exact: true }).click();
    await page.getByRole("menuitem", { name: "Remove 😂 reaction" }).click();
  }
  await expect(reply.getByRole("button", { name: "Who reacted: You reacted 😂" })).toHaveCount(0);
});

test.describe("in the terminal theme", () => {
  test.use({ localStorageOverrides: { color_theme: "terminal" } });

  test("every reaction is offered, not just a like", async ({ page, mockAI }) => {
    mockAI.reply("Ha, fair enough.");
    await openChat(page);
    await sendMessage(page, "I tripped on the stairs again");
    await waitForReplyDone(page);
    // The newest reply is the last one with a "[react]" link.
    await page.getByRole("button", { name: "[react]", exact: true }).last().click();
    const picker = page.getByRole("group", { name: "React" });
    for (const emoji of ["❤️", "😂", "😮", "😢", "😡", "👍"]) await expect(picker.getByRole("button", { name: `React with ${emoji}` })).toBeVisible();
    await picker.getByRole("button", { name: "React with 😂" }).click();
    await expect(page.getByText("# you reacted 😂")).toBeVisible();
  });
});
