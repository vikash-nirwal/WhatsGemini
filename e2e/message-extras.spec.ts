import { test, expect, openChat, sendMessage, waitForReplyDone, messageBubble, chatMessages, PHONE_REDESIGN_SKIP, messageAction } from "./fixtures";

// WhatsApp-style message extras. Quoted replies (#119): reply to one message with its quote above yours,
// and a character can quote one of yours with [Re: ...].

test.use({ seed: { messages: 4 } });

test("you can reply to a message, and the quote goes with it", async ({ page, mockAI }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", PHONE_REDESIGN_SKIP);
  mockAI.reply("Oh, that one!");
  await openChat(page);
  const target = messageBubble(page, "Aria message 3: how was your day?");
  await target.hover();
  await target.getByRole("button", { name: "Reply" }).click();
  await expect(page.getByRole("group", { name: "Replying to Aria" })).toContainText("Aria message 3");
  await sendMessage(page, "It was lovely.");
  await waitForReplyDone(page);
  await expect(page.getByRole("group", { name: "Replying to Aria" })).toHaveCount(0);
  await expect(messageBubble(page, "It was lovely.").locator('[data-slot="quoted-message"]')).toContainText("Aria message 3");
  const prompt = mockAI.requests.filter((r) => r.stream)[0].prompt;
  expect(prompt).toContain('(replying to "Aria message 3: how was your day?") It was lovely.');
});

test("a reply can be dropped before sending", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", PHONE_REDESIGN_SKIP);
  await openChat(page);
  const target = messageBubble(page, "Aria message 1: how was your day?");
  await target.hover();
  await target.getByRole("button", { name: "Reply" }).click();
  await page.getByRole("button", { name: "Cancel reply" }).click();
  await expect(page.getByRole("group", { name: /Replying to/ })).toHaveCount(0);
});

test("a character's [Re: ...] quotes one of your messages", async ({ page, mockAI }) => {
  mockAI.reply("[Re: User message 2] About that, yes, it was fine for me too.");
  await openChat(page);
  await sendMessage(page, "So?");
  await waitForReplyDone(page);
  const reply = messageBubble(page, "About that, yes");
  await expect(reply).not.toContainText("[Re:");
  await expect(reply.locator('[data-slot="quoted-message"]')).toContainText("User message 2: it was fine, thanks.");
  await expect(chatMessages(page).getByText("About that, yes, it was fine for me too.")).toBeVisible();
});

// Message info (#121): when your message was delivered and read.
test("message info shows when your message was delivered and read", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", PHONE_REDESIGN_SKIP);
  await openChat(page);
  const mine = messageBubble(page, "User message 2: it was fine, thanks.");
  await mine.hover();
  await messageAction(page, mine, "Info");
  const dialog = page.getByRole("dialog", { name: "Message info" });
  await expect(dialog.getByRole("list", { name: "Read by" })).toContainText("Read");
  await expect(dialog.getByRole("list", { name: "Read by" })).toContainText("Delivered");
  await expect(dialog.getByRole("list", { name: "Read by" })).not.toContainText("Not yet");
  // The More menu fades out first; until it's gone it still takes Escape.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
  // Your last message hasn't been answered yet.
  const last = messageBubble(page, "User message 4: it was fine, thanks.");
  await last.hover();
  await messageAction(page, last, "Info");
  await expect(page.getByRole("dialog", { name: "Message info" })).toContainText("Not yet");
});

// View-once photos (#122): opens once, then only "Opened" is left.
test("a view-once photo opens once", async ({ page }) => {
  await openChat(page);
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await page.evaluate(async (image) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const store = db.transaction("chats", "readwrite").objectStore("chats");
      const get = store.get(1);
      get.onsuccess = () => {
        const chat = get.result;
        chat.content.push({ id: "vo-1", role: "ai", txt: "just for you 🙈", images: [image], viewOnce: true, speakerId: 1, timestamp: Date.now() });
        store.put(chat);
        store.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, pixel);
  await page.reload();
  const bubble = messageBubble(page, "just for you");
  await expect(bubble.getByRole("img", { name: "Generated" })).toHaveCount(0);
  await bubble.getByRole("button", { name: /view once/ }).click();
  await expect(page.getByRole("img", { name: "Fullscreen" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bubble.locator('[data-slot="view-once"][data-state="opened"]')).toHaveText(/Opened/);
  await page.reload();
  await expect(messageBubble(page, "just for you").locator('[data-slot="view-once"]')).toHaveText(/Opened/);
});

// Forwarded (#123): a character forwards something, and you forward a
// message to another chat.
test.describe("forwarding", () => {
  test.use({ seed: { messages: 4, room: true } });

  test("a character's [Fwd: ...] shows as forwarded", async ({ page, mockAI }) => {
    mockAI.reply("[Fwd: Why did the scarecrow win an award? He was outstanding in his field.] this is so you 😂");
    await openChat(page);
    await sendMessage(page, "Bored.");
    await waitForReplyDone(page);
    const reply = messageBubble(page, "this is so you");
    await expect(reply).not.toContainText("[Fwd:");
    await expect(reply.locator('[data-slot="forwarded"]')).toContainText("outstanding in his field");
  });

  test("you can forward a message to another chat", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", PHONE_REDESIGN_SKIP);
    await openChat(page);
    const source = messageBubble(page, "Aria message 3: how was your day?");
    await source.hover();
    await messageAction(page, source, "Forward");
    const dialog = page.getByRole("dialog", { name: "Forward to…" });
    await dialog.getByRole("button", { name: /Aria & Kai/ }).click();
    await dialog.getByRole("button", { name: "Forward", exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\/2$/);
    await expect(page.locator('[data-slot="forwarded"]').filter({ hasText: "Aria message 3: how was your day?" })).toBeVisible();
  });
});

// Shared contacts (#128): a character's [Contact: ...] card, and "Message"
// drafting that person and opening a chat with them.
test("a shared contact becomes a new character you can message", async ({ page, mockAI }) => {
  const draft = { name: "Lena", description: "Aria's older sister, a night-shift nurse.", personalityTraits: ["warm", "blunt"], prompt: "You are Lena, Aria's sister, a nurse.", scenario: "", first_mes: "Hey, Aria said you'd text.", alternateGreetings: [], mes_example: "", relationship: "Aria's sister", appearance: "Short dark hair.", visualTags: "" };
  mockAI.reply((req) => (req.prompt.includes("Lena, my sister, a nurse") ? JSON.stringify(draft) : "You two would get along.\n[Contact: Lena — my sister, a nurse]"));
  await openChat(page);
  await sendMessage(page, "Know anyone who works nights?");
  await waitForReplyDone(page);
  const reply = messageBubble(page, "You two would get along.");
  await expect(reply).not.toContainText("[Contact");
  await expect(reply.locator('[data-slot="contact-card"]')).toContainText("my sister, a nurse");
  await reply.getByRole("button", { name: "Message Lena" }).click();
  await expect(page).toHaveURL(/#\/chat\/2$/, { timeout: 15_000 });
  await expect(page.locator("header").first()).toContainText("Lena");
  const lena = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows: any[] = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").getAll();
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return rows.map((c) => ({ id: c.id, name: c.name, knowsAbout: c.knowsAbout }));
  });
  expect(lena.find((c) => c.name === "Lena")?.knowsAbout).toEqual([1]);
  expect(lena.find((c) => c.name === "Aria")?.knowsAbout).toContain(lena.find((c) => c.name === "Lena")?.id);
});
