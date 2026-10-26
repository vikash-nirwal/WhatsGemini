import { test, expect, openChat, openRoute, sendMessage, waitForReplyDone } from "./fixtures";

// A world's timeline (#161): what happens in a world is written down as it
// happens - here a god-mode change - and shown newest first, filterable.

test.use({ seed: { messages: 2 } });

test("a god-mode change shows on the world's timeline", async ({ page, mockAI }) => {
  mockAI.reply("Of course.");
  await openChat(page);
  await page.getByRole("button", { name: "Composer options" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Toggle god mode" }).click();
  await sendMessage(page, "It has snowed all week");
  await waitForReplyDone(page);

  await openRoute(page, "/worlds/mine/timeline");
  const timeline = page.getByRole("list", { name: "World timeline" });
  await expect(timeline).toContainText("Made true", { timeout: 30_000 });
  await expect(timeline).toContainText("It has snowed all week");
  await expect(timeline).toContainText("Today");
});

test("an empty world's timeline says what will show there", async ({ page }) => {
  await openRoute(page, "/worlds/mine/timeline");
  await expect(page.getByText("Nothing has happened here yet.", { exact: false })).toBeVisible({ timeout: 30_000 });
});

// #190: search the timeline, and narrow it to one person.
test("the timeline can be searched and narrowed to someone", async ({ page }) => {
  await openChat(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put({ key: "world_timeline_mine", value: [
        { id: "a", at: Date.now() - 3000, kind: "event", text: "The Great Flood" },
        { id: "b", at: Date.now() - 2000, kind: "arrival", text: "Aria arrived", characterIds: [1] },
        { id: "c", at: Date.now() - 1000, kind: "event", text: "Aria opened a bakery", characterIds: [1] },
      ] });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await openRoute(page, "/worlds/mine/timeline");
  const list = page.getByRole("list", { name: "World timeline" });
  await page.getByRole("textbox", { name: "Search the timeline" }).fill("flood");
  await expect(list).toContainText("The Great Flood");
  await expect(list).not.toContainText("bakery");
  await page.getByRole("textbox", { name: "Search the timeline" }).fill("");
  await page.getByRole("combobox", { name: "Only about" }).click();
  await page.getByRole("option", { name: "Aria" }).click();
  await expect(list).toContainText("Aria opened a bakery");
  await expect(list).not.toContainText("The Great Flood");
});
