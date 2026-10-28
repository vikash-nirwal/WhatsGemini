import { test, expect, openRoute, openChat, sendMessage, messageBubble, ARIA } from "./fixtures";

// Background tasks (the user's ask, 2026-10-28): what you start keeps going
// when you switch screens, says when it's done wherever you are, and its
// screen shows it still running, or what it made, when you come back.

test.use({ seed: { messages: 2, room: true } });

test("an announcement finishes after you leave the Worlds page", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.includes("It has just been announced to everyone") ? "Aria :: You're thrilled. :: -" : "Mock reply"));
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await openRoute(page, "/worlds");
  await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const worlds: any[] = await new Promise((r) => { const q = db.transaction("worlds").objectStore("worlds").getAll(); q.onsuccess = () => r(q.result); });
    const tx = db.transaction("characters", "readwrite");
    const store = tx.objectStore("characters");
    const get = store.get(id);
    get.onsuccess = () => store.put({ ...get.result, worldId: worlds.find((w) => w.name === "Harbour Town").id });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  }, ARIA.id);
  await page.reload();

  const release = mockAI.hold();
  const section = page.getByRole("region", { name: "Announcements" });
  await section.getByRole("textbox", { name: "Announcement" }).fill("The bridge is closed.");
  await section.getByRole("button", { name: "Announce" }).click();
  await expect(section.getByRole("button", { name: "Telling everyone..." })).toBeDisabled();

  // Away and back while it runs: still running, not free to start again.
  await openRoute(page, "/characters");
  await expect(page.getByText("Announcing to Harbour Town...")).toBeVisible();
  await openRoute(page, "/worlds");
  await expect(section.getByRole("button", { name: "Telling everyone..." })).toBeDisabled();

  // Done while you're elsewhere: the toast says so, and the takes are kept.
  await openRoute(page, "/characters");
  release();
  await expect(page.getByText("Everyone in Harbour Town heard it")).toBeVisible();
  await page.getByRole("button", { name: "View" }).click();
  await expect(section.getByRole("button", { name: "How they took it · 1" })).toBeVisible();
  await expect(section.getByRole("button", { name: "Announce" })).toBeDisabled(); // nothing typed
});

test("a reply keeps coming after you leave its chat, and other chats aren't held up", async ({ page, mockAI }) => {
  mockAI.reply("here's my answer");
  await openChat(page, 1);
  const release = mockAI.hold();
  await sendMessage(page, "tell me something");
  await expect.poll(() => mockAI.requests.filter((r) => r.stream).length).toBe(1);

  // The group chat isn't busy with Aria's reply: you can write there.
  await openChat(page, 2);
  await page.getByLabel("Message input").fill("hi all");
  await expect(page.getByRole("button", { name: "Send Message" })).toBeEnabled();

  release();
  await openChat(page, 1);
  await expect(messageBubble(page, "here's my answer")).toBeVisible({ timeout: 15_000 });
});
