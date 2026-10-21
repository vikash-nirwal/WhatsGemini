import { test, expect, openChat, headerAction, messageBubble } from "./fixtures";

// Branch map (#53): every storyline in a chat, and a way to jump to one.

test.use({ seed: { messages: 3 } });

test("the branch map shows the storylines and jumps to another one", async ({ page }) => {
  await openChat(page);
  // Give the chat a second ending: the last reply has another variant.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("chats", "readwrite");
      const store = tx.objectStore("chats");
      const get = store.get(1);
      get.onsuccess = () => {
        const content = get.result.content;
        const [a, b, c] = content;
        const alt = { ...c, id: "alt", txt: "A whole other ending, at the lighthouse." };
        const tree = {
          nodes: {
            [a.id]: { id: a.id, parentId: null, childIds: [b.id], message: a },
            [b.id]: { id: b.id, parentId: a.id, childIds: [c.id, "alt"], message: b },
            [c.id]: { id: c.id, parentId: b.id, childIds: [], message: c },
            alt: { id: "alt", parentId: b.id, childIds: [], message: alt },
          },
        };
        store.put({ ...get.result, tree, activeLeafId: c.id });
      };
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await headerAction(page, "Branch map (every storyline in this chat)");
  const dialog = page.getByRole("dialog", { name: "Branch map" });
  await expect(dialog).toContainText("2 storylines");
  await expect(dialog.getByRole("button", { name: /You're here/ })).toContainText("Aria message 3");

  await dialog.getByRole("button", { name: /A whole other ending/ }).click();
  await expect(dialog).toBeHidden();
  await expect(messageBubble(page, "A whole other ending, at the lighthouse.")).toBeVisible();
  await expect(page.getByText("Aria message 3: how was your day?")).toHaveCount(0);
});
