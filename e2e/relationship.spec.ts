import { test, expect, openChat, sendMessage, ARIA } from "./fixtures";

// Relationship that evolves (#30): past 20 messages a helper call may
// suggest a new label, which the user approves or keeps as is.

test.use({ seed: { messages: 30 }, localStorageOverrides: { roleplay_style: JSON.stringify({ relationshipSuggestions: true }) } });

const SUGGESTED = "Close friends who tease each other";

const answer = (prompt: string) => (prompt.includes("decide whether their relationship has clearly changed") ? SUGGESTED : "Ha, sure thing.");

const relationshipInDb = (page: import("@playwright/test").Page) =>
  page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const c: any = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").get(id);
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return c.relationship;
  }, ARIA.id);

test("a suggested relationship is shown, and updating it changes the character", async ({ page, mockAI }) => {
  mockAI.reply((req) => answer(req.prompt));
  await openChat(page);
  await sendMessage(page, "You're my favourite person to talk to");

  const card = page.getByRole("region", { name: "Relationship update" });
  await expect(card).toContainText(SUGGESTED, { timeout: 15_000 });
  await expect(card).toContainText("New Friend");
  await card.getByRole("button", { name: "Update" }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(() => relationshipInDb(page)).toBe(SUGGESTED);
});

test("keeping it as is changes nothing, and it isn't asked again right away", async ({ page, mockAI }) => {
  mockAI.reply((req) => answer(req.prompt));
  await openChat(page);
  await sendMessage(page, "Thanks for today");
  const card = page.getByRole("region", { name: "Relationship update" });
  await card.getByRole("button", { name: "Keep as is" }).click();
  await expect(card).toHaveCount(0);
  expect(await relationshipInDb(page)).toBe("New Friend");

  const checks = () => mockAI.requests.filter((r) => r.prompt.includes("decide whether their relationship")).length;
  expect(checks()).toBe(1);
  await sendMessage(page, "See you tomorrow");
  await expect.poll(() => mockAI.requests.filter((r) => r.prompt.includes("See you tomorrow")).length).toBe(1);
  await page.waitForTimeout(1000);
  expect(checks()).toBe(1);
});
