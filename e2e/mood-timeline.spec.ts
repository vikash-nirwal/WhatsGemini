import { test, expect, openChat, headerAction } from "./fixtures";

// Relationship timeline (#51): the character's moods over the chat, in the
// Scene panel, from the emotion tags on their replies.

test.use({ seed: { messages: 12 } });

const MOODS = ["sad", "annoyed", "neutral", "happy", "happy", "flirty"];

test("the Scene panel charts the character's mood and lists it", async ({ page }) => {
  await openChat(page);
  await page.evaluate(async (moods) => {
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
        let n = 0;
        const content = get.result.content.map((m: any) => (m.role === "ai" ? { ...m, emotion: moods[n++] } : m));
        store.put({ ...get.result, content });
      };
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, MOODS);
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await headerAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Story", exact: true }).click();

  await expect(page.getByText("Mostly happy (33%), warming up lately.")).toBeVisible();
  const chart = page.getByRole("img", { name: /Aria's mood over the last 6 replies/ });
  await expect(chart).toBeVisible();

  // The arrow keys move to a reply and the chart says which. The mouse is
  // moved off first: resting over the chart, it would pick a reply itself.
  await page.mouse.move(0, 0);
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  await expect(chart).toHaveAttribute("aria-label", /Selected: flirty/);
  await page.keyboard.press("ArrowLeft");
  await expect(chart).toHaveAttribute("aria-label", /Selected: happy/);

  await page.getByText("Show as a list").click();
  const list = page.getByRole("list", { name: "Recent moods" });
  await expect(list.getByRole("listitem")).toHaveCount(6);
  await expect(list.getByRole("listitem").first()).toContainText("flirty");
});
