import type { Page } from "@playwright/test";
import { test, expect, openChat, ARIA, KAI } from "./fixtures";

// Character feed (#85): statuses get likes and comments; the others react
// in character after a post, and you can like, comment (the poster
// answers) or see every status in the feed.

test.use({ seed: { messages: 4, room: true } });

const withDb = <T,>(page: Page, id: number, fields?: Record<string, unknown>) =>
  page.evaluate(
    async ({ id, fields }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const row: any = await new Promise((resolve) => {
        const tx = db.transaction("characters", fields ? "readwrite" : "readonly");
        const s = tx.objectStore("characters");
        const get = s.get(id);
        get.onsuccess = () => {
          if (fields) s.put({ ...get.result, ...fields });
          resolve(get.result);
        };
      });
      db.close();
      return row;
    },
    { id, fields }
  ) as Promise<T>;

test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the sidebar is always shown on wide screens; phones open it from the menu");

const STATUS = { id: "s1", text: "Pottery class tonight!", createdAt: Date.now() - 60_000, likes: [KAI.id], comments: [{ id: "c1", from: KAI.id, text: "Don't break the wheel.", at: Date.now() - 30_000 }] };

test("a status shows likes and comments; you can like it and comment, and Aria answers", async ({ page, mockAI }) => {
  mockAI.reply("Thanks! I'll show you what I make.");
  await openChat(page);
  await withDb(page, ARIA.id, { statuses: [STATUS] });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Aria's status, new" }).click();
  const viewer = page.getByRole("dialog", { name: "Aria's status" });
  await expect(viewer).toContainText("Liked by Kai");
  await expect(viewer.getByRole("list", { name: "Comments" })).toContainText("Kai Don't break the wheel.");

  await viewer.getByRole("button", { name: "Like" }).click();
  await expect(viewer.getByRole("button", { name: "Unlike" })).toHaveAttribute("aria-pressed", "true");
  await expect(viewer).toContainText("Liked by you, Kai");

  await viewer.getByRole("textbox", { name: "Comment on Aria's status" }).fill("Have fun!");
  await viewer.getByRole("button", { name: "Post" }).click();
  const comments = viewer.getByRole("list", { name: "Comments" });
  await expect(comments).toContainText("You Have fun!");
  await expect(comments).toContainText("Aria Thanks! I'll show you what I make.");
  expect(mockAI.requests[0].prompt).toContain('commented: "Have fun!"');
  await expect.poll(async () => (await withDb<any>(page, ARIA.id)).statuses[0].comments.map((c: any) => c.from)).toEqual([KAI.id, "you", ARIA.id]);
});

test("the feed lists every character's statuses, newest first", async ({ page }) => {
  await openChat(page);
  await withDb(page, ARIA.id, { statuses: [STATUS] });
  await withDb(page, KAI.id, { statuses: [{ id: "k1", text: "Rebuilt the carburettor. Again.", createdAt: Date.now() - 10_000 }] });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  const feed = page.getByRole("dialog", { name: "Feed" });
  const posts = feed.getByRole("list", { name: "Statuses" }).locator(":scope > li");
  await expect(posts).toHaveCount(2);
  await expect(posts.nth(0)).toContainText("Kai");
  await expect(posts.nth(0)).toContainText("Rebuilt the carburettor.");
  await expect(posts.nth(1)).toContainText("Pottery class tonight!");
});

test("after a post, the others react in character", async ({ page, mockAI }) => {
  await page.clock.install();
  mockAI.reply((req) => (req.prompt.includes("Their friends who see it") ? '[{"name": "Kai", "like": true, "comment": "Try not to glue your fingers again."}]' : "Pottery class tonight!"));
  await openChat(page);
  await withDb(page, ARIA.id, { postsStatuses: true });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await page.clock.fastForward(20_000);

  await expect(page.getByRole("button", { name: "Aria's status, new" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await withDb<any>(page, ARIA.id)).statuses?.[0]?.comments?.length ?? 0).toBe(1);
  const reactions = mockAI.requests.find((r) => r.prompt.includes("Their friends who see it"))!;
  expect(reactions.prompt).toContain("- Kai:");
  await page.getByRole("button", { name: "Aria's status, new" }).click();
  await expect(page.getByRole("dialog", { name: "Aria's status" })).toContainText("Try not to glue your fingers again.");
});
