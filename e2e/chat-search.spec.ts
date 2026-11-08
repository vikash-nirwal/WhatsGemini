import { test, expect, openChat, headerAction, messageBubble } from "./fixtures";
import type { Page } from "@playwright/test";

// Search inside a chat (#247): the count, older/newer, the match scrolled to
// and marked, and a match on another branch switching to it.

const searchBar = (page: Page) => page.getByRole("search", { name: "Search this chat" });
const hit = (page: Page) => page.locator('[data-search-hit="true"]');

// The last message of the seeded chat gets a second version, so one match
// is on a branch that isn't showing.
const addBranch = async (page: Page) => {
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
        const content = get.result.content as { id: string; txt: string }[];
        const nodes: Record<string, unknown> = {};
        content.forEach((m, i) => {
          nodes[m.id] = { id: m.id, parentId: i > 0 ? content[i - 1].id : null, childIds: i < content.length - 1 ? [content[i + 1].id] : [], message: m };
        });
        const last = content[content.length - 1];
        const before = content[content.length - 2];
        const alt = { ...last, id: "alt", txt: "Let's meet at the lighthouse instead." };
        nodes.alt = { id: "alt", parentId: before.id, childIds: [], message: alt };
        (nodes[before.id] as { childIds: string[] }).childIds = [last.id, "alt"];
        store.put({ ...get.result, tree: { nodes }, activeLeafId: last.id });
      };
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
};

test.describe("in a 1:1 chat", () => {
  test.use({ seed: { messages: 30 } });

  test("finds words, steps through them and switches branch for a hidden one", async ({ page }) => {
    await openChat(page);
    await addBranch(page);

    await headerAction(page, "Search this chat");
    const field = searchBar(page).getByLabel("Search messages");
    await expect(field).toBeFocused();
    await field.fill("how was your day");
    // It starts at the newest match.
    await expect(searchBar(page)).toContainText("15 of 15");
    await expect(hit(page)).toContainText("Aria message 29");
    // The words themselves are marked where the browser can.
    await expect.poll(() => page.evaluate(() => {
      const registry = (CSS as unknown as { highlights?: Map<string, Set<Range>> }).highlights;
      return registry ? registry.get("chat-search")?.size ?? 0 : 1;
    })).toBeGreaterThan(0);

    await searchBar(page).getByRole("button", { name: "Older match" }).click();
    await expect(searchBar(page)).toContainText("14 of 15");
    await expect(hit(page)).toContainText("Aria message 27");
    await field.press("Shift+Enter");
    await expect(searchBar(page)).toContainText("15 of 15");

    // Far up the chat: scrolled to.
    await field.fill("aria MESSAGE 3:");
    await expect(searchBar(page)).toContainText("1 of 1");
    await expect(hit(page)).toContainText("Aria message 3:");
    await expect(hit(page)).toBeInViewport();

    // Only on the other branch: counted, and shown once chosen.
    await field.fill("lighthouse");
    await expect(searchBar(page)).toContainText("1 match");
    await expect(hit(page)).toHaveCount(0);
    await field.press("Enter");
    await expect(searchBar(page)).toContainText("1 of 1");
    await expect(searchBar(page)).toContainText("Switched to the branch with this message");
    await expect(messageBubble(page, "Let's meet at the lighthouse instead.")).toBeVisible();
    await expect(hit(page)).toBeInViewport();
    await expect(page.getByText("User message 30: it was fine, thanks.")).toHaveCount(0);

    await field.fill("nothing like this");
    await expect(searchBar(page)).toContainText("No matches");
    await field.press("Escape");
    await expect(searchBar(page)).toHaveCount(0);
  });
});

test.describe("in a group chat", () => {
  test.use({ seed: { room: true } });

  test("finds a member's message", async ({ page }) => {
    await openChat(page, 2);
    await headerAction(page, "Search this chat");
    await searchBar(page).getByLabel("Search messages").fill("touch");
    await expect(searchBar(page)).toContainText("1 of 1");
    await expect(hit(page)).toContainText("Don't touch anything.");
    await searchBar(page).getByRole("button", { name: "Close search" }).click();
    await expect(hit(page)).toHaveCount(0);
  });
});
