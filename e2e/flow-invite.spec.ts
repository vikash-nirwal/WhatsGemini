import { test, expect, openChat, headerAction, sendMessage } from "./fixtures";

// The room seed adds Kai, so there is someone to invite into Aria's 1:1.
test.use({ seed: { room: true } });

test("invite a second character into a 1:1 chat to make it a group chat", async ({ page, mockAI }) => {
  await openChat(page, 1);
  await headerAction(page, "Invite someone");

  // The participants panel opens with an "Invite someone" button of its own.
  await page.getByRole("button", { name: "Invite someone", exact: true }).last().click();
  await page.getByRole("textbox", { name: "Search characters to invite" }).fill("Ka");
  await page.getByRole("button", { name: /^KA Kai/ }).click();

  // Inviting branches into a new group chat; the 1:1 stays as it was.
  await expect(page).not.toHaveURL(/#\/chat\/1$/);
  await expect(page).toHaveURL(/#\/chat\/\d+$/);
  const header = page.locator("header").first();
  await expect(header).toContainText("With Aria, Kai");
  await expect(page.getByLabel("Message input")).toBeVisible();

  // Both characters are now in the conversation the AI sees. (In a room the
  // app strips a leading "Name:" from replies, so the mock doesn't add one.)
  mockAI.reply("Fine, I'll help.");
  await sendMessage(page, "Can you both help me?");
  await expect(page.getByText("Fine, I'll help.").first()).toBeVisible();
  const prompt = mockAI.requests[0].messages.map((m) => m.content).join("\n");
  expect(prompt).toContain("Kai");
});

// The user's report (2026-10-30): inviting someone into a 1:1 chat in a world
// moved you to My world, and the newcomer opened with their card's fixed
// greeting. The group keeps the world, and the newcomer's first message is
// written with the conversation in front of them.
test("someone invited into a world's 1:1 keeps the world and joins in context", async ({ page, mockAI }) => {
  await openChat(page, 1);
  const worldId = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const tx = db.transaction(["worlds", "characters", "chats"], "readwrite");
    const id: number = await new Promise((r) => { const q = tx.objectStore("worlds").add({ name: "Harbour Town", premise: "A rainy port." }); q.onsuccess = () => r(q.result as number); });
    const chars = tx.objectStore("characters");
    for (const cid of [1, 2]) {
      const get = chars.get(cid);
      get.onsuccess = () => chars.put({ ...get.result, worldId: id, ...(cid === 2 ? { first_mes: "Yo. Name's Kai, I fix boats." } : {}) });
    }
    const chats = tx.objectStore("chats");
    const getChat = chats.get(1);
    getChat.onsuccess = () => chats.put({ ...getChat.result, worldId: id, scenario: "Rain at the harbour." });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
    localStorage.setItem("current_world", String(id));
    return id;
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  mockAI.reply((req) => (req.prompt.includes("has just added you to this conversation") || req.messages?.some((m: any) => String(m.content).includes("has just added you")) ? "Kai: Oh, the boat talk again? Hey Aria." : "Mock reply"));
  await headerAction(page, "Invite someone");
  await page.getByRole("button", { name: "Invite someone", exact: true }).last().click();
  await page.getByRole("textbox", { name: "Search characters to invite" }).fill("Ka");
  await page.getByRole("button", { name: /^KA Kai/ }).click();
  await expect(page).not.toHaveURL(/#\/chat\/1$/);

  // Kai joins in, from the conversation, not with the fixed greeting.
  await expect(page.getByText("Oh, the boat talk again? Hey Aria.").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Name's Kai, I fix boats.")).toHaveCount(0);
  const ask = mockAI.requests.filter((r) => r.stream).pop()!;
  expect(ask.messages.map((m) => m.content).join("\n")).toContain("has just added you to this conversation");

  // The group is still in Harbour Town, and so are you.
  const chatId = Number(page.url().match(/chat\/(\d+)$/)![1]);
  const group = await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const c: any = await new Promise((r) => { const g = db.transaction("chats").objectStore("chats").get(id); g.onsuccess = () => r(g.result); });
    db.close();
    return { worldId: c.worldId, scenario: c.scenario, arrivals: c.arrivals };
  }, chatId);
  expect(group).toEqual({ worldId, scenario: "Rain at the harbour.", arrivals: [] });
  expect(await page.evaluate(() => localStorage.getItem("current_world"))).toBe(String(worldId));

  // Opening it again doesn't make Kai say hello twice.
  const before = mockAI.requests.length;
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  expect(mockAI.requests.length).toBe(before);
});
