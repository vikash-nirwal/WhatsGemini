import { test, expect, openChat, headerAction, sendMessage } from "./fixtures";

// A World attached to a normal chat (#28): its setting and lore reach the
// character's prompt, as in an adventure.

test.use({ seed: { messages: 4 } });

test("a chat can use a World's setting and lore", async ({ page, mockAI }) => {
  await openChat(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("worlds", "readwrite");
      tx.objectStore("worlds").put({
        id: 7,
        name: "Eldoria",
        premise: "A floating archipelago where storms carry magic.",
        loreEntries: [{ id: "l1", keywords: ["sky council"], content: "The Sky Council has nine seats, one per island." }],
      });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await headerAction(page, "Scene & chat settings");
  await page.getByRole("combobox", { name: "World for this chat" }).click();
  await page.getByRole("option", { name: "Eldoria" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  mockAI.reply("Nine seats, one for each island.");
  await sendMessage(page, "Tell me about the Sky Council.");
  await expect.poll(() => mockAI.requests.length).toBe(1);
  const system = mockAI.requests[0].messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("This story takes place in the world of Eldoria.");
  expect(system).toContain("The Sky Council has nine seats, one per island.");
});
