import { test, expect, openChat, sendMessage, waitForReplyDone } from "./fixtures";

// World history remembered (#179): what happened in the world before goes
// into the prompt as history, not as what's happening now.

test.use({ seed: { messages: 2 } });

test("a chat's prompt recalls the world's past", async ({ page, mockAI }) => {
  mockAI.reply("Mock reply");
  await openChat(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put({ key: "world_timeline_mine", value: [{ id: "t1", at: Date.now() - 5 * 86_400_000, kind: "event", text: "The Great Flood: the river burst its banks" }] });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await sendMessage(page, "remember last week?");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("What's happened in this world before");
  expect(system).toContain("- 5 days ago: The Great Flood: the river burst its banks");
});
