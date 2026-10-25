import { test, expect, openChat, sendMessage, waitForReplyDone, ARIA } from "./fixtures";

// Character stickers (#137): with a set drawn, a reply's [Sticker: mood]
// shows that sticker, and the set is listed in Contact info.

test.use({ seed: { messages: 3 } });

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("a reply can carry a sticker from the character's set", async ({ page, mockAI }) => {
  mockAI.reply("Stop it 😂\n[Sticker: laughing]");
  await openChat(page);
  await page.evaluate(async ({ id, image }) => {
    const db: IDBDatabase = await new Promise((resolve) => { const req = indexedDB.open("ChatAppDB"); req.onsuccess = () => resolve(req.result); });
    await new Promise<void>((resolve) => {
      const store = db.transaction("characters", "readwrite").objectStore("characters");
      const get = store.get(id);
      get.onsuccess = () => { store.put({ ...get.result, stickers: [{ id: "s1", mood: "laughing", image }] }); store.transaction.oncomplete = () => resolve(); };
    });
    db.close();
  }, { id: ARIA.id, image: PIXEL });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await sendMessage(page, "I tripped over the cat");
  await waitForReplyDone(page);
  expect(JSON.stringify(mockAI.requests[0].messages)).toContain("has a sticker set (laughing)");
  await expect(page.getByRole("img", { name: "Sticker: laughing" })).toBeVisible();
  await expect(page.getByText("[Sticker:")).toHaveCount(0);
});
