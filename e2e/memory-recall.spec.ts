import { test, expect, openChat, openRoute, sendMessage, waitForReplyDone, ARIA } from "./fixtures";

// Memory recall by meaning (#200): with it on, a fact that fits what you
// say makes it into the reply's prompt even without sharing its words.
// The embedding model is stood in for by a fake that groups family words.

test.use({ seed: { messages: 2 } });

test("a fact that fits in meaning is recalled", async ({ page, mockAI }) => {
  await page.addInitScript(() => {
    (window as any).__kindredEmbed = async (texts: string[]) => texts.map((t) => (/sister|nora|family|sibling/i.test(t) ? [1, 0] : [0, 1]));
  });
  mockAI.reply("Mock reply");
  await openRoute(page, "/settings/text");
  await page.getByRole("switch", { name: "Find memories by meaning" }).click();
  await openChat(page);
  // More facts than fit, so only the relevant ones go in.
  const filler = Array.from({ length: 40 }, (_, i) => `Sam's favourite number is ${i}`);
  await page.evaluate(async ({ id, memory }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const os = db.transaction("characters", "readwrite").objectStore("characters");
      const get = os.get(id);
      get.onsuccess = () => {
        os.put({ ...get.result, memory });
        os.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, { id: ARIA.id, memory: ["Sam's sister Nora is sick", ...filler] });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await sendMessage(page, "the thing with my family is getting worse");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("Sam's sister Nora is sick");
});
