import { test, expect, openRoute, openChat, sendMessage, waitForReplyDone, ARIA, KAI } from "./fixtures";

// Life inside a world (#145): two characters who know each other text on
// their own; Peek (off by default) shows the thread read-only, and the next
// reply knows about it.

test.use({ seed: { messages: 4, room: true } });

const TALK = "Aria: you up?\nKai: always. engine trouble again?\nAria: harbour at 6, bring coffee";

const patchCharacter = (page: import("@playwright/test").Page, id: number, patch: Record<string, unknown>) =>
  page.evaluate(async ({ id, patch }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const store = db.transaction("characters", "readwrite").objectStore("characters");
      const get = store.get(id);
      get.onsuccess = () => {
        store.put({ ...get.result, ...patch });
        store.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, { id, patch });

const talksInDb = (page: import("@playwright/test").Page) =>
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
    return c.talks || [];
  }, ARIA.id);

test("characters who know each other text on their own, and Peek shows it", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 10, 0, 0) });
  mockAI.reply((req) => (req.prompt.includes("Write a text conversation between") ? TALK : "Mock reply"));
  await openRoute(page, "/");
  await expect(page.getByRole("link", { name: /^AR Aria/ })).toBeVisible({ timeout: 30_000 });
  await patchCharacter(page, ARIA.id, { knowsAbout: [KAI.id] });
  await page.reload();
  await page.clock.fastForward(40_000);
  await expect.poll(() => talksInDb(page), { timeout: 15_000 }).toHaveLength(1);
  const ask = mockAI.requests.find((r) => r.prompt.includes("Write a text conversation between"))!.prompt;
  expect(ask).toContain("between Aria and Kai");
  expect(ask).toContain("2 to 10 short texts");
  // Relationships don't drift unless that's switched on.
  expect(ask).not.toContain("TIE:");

  // Hidden until Peek is turned on for this world.
  await expect(page.getByRole("link", { name: /^Peek/ })).toHaveCount(0);
  await openRoute(page, "/worlds");
  await page.getByRole("group", { name: "Life in My world" }).getByText("Peek at their own texts").click();
  await openRoute(page, "/");
  await page.getByRole("link", { name: "Peek, 1 thread" }).click();
  await page.getByRole("list", { name: "Threads" }).getByRole("link", { name: /Aria & Kai/ }).click();
  await expect(page.getByRole("note")).toContainText("You're reading, not in this chat.");
  await expect(page.getByRole("list", { name: "Their texts" })).toContainText("harbour at 6, bring coffee");
  await expect(page.getByLabel("Message input")).toHaveCount(0);

  // Aria's next reply knows about it.
  await openChat(page);
  await sendMessage(page, "morning!");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("Recently you texted Kai:\nAria: you up?");
});

// Worlds keep running (#146): life goes on in a world you've left, unless
// its "keep living" switch is off.
test("a world you've left keeps living unless it's switched off", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 10, 0, 0) });
  mockAI.reply((req) => (req.prompt.includes("Write a text conversation between") ? TALK : "Mock reply"));
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Elsewhere");
  await page.locator("#world-premise").fill("Somewhere else entirely.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("group", { name: "Life in My world" }).getByText("Keep living while I'm elsewhere").click();
  await page.getByRole("button", { name: "Switch to Elsewhere" }).click();
  await patchCharacter(page, ARIA.id, { knowsAbout: [KAI.id] });
  await page.reload();
  await page.clock.fastForward(40_000);
  await page.clock.fastForward(60 * 60_000);
  expect(mockAI.requests.some((r) => r.prompt.includes("Write a text conversation between"))).toBe(false);

  await openRoute(page, "/worlds");
  await page.getByRole("group", { name: "Life in My world" }).getByText("Keep living while I'm elsewhere").click();
  await page.clock.fastForward(60 * 60_000);
  await expect.poll(() => talksInDb(page), { timeout: 15_000 }).toHaveLength(1);
});

// Relationships that drift (#163): a talk that changes how two people stand
// updates their tie both ways, with a notice and a timeline entry.
test("a talk that changes things changes their relationship", async ({ page, mockAI }) => {
  // Off until switched on (the user's call); switched on for My world here.
  await page.addInitScript(() => localStorage.setItem("world_prefs", JSON.stringify({ mine: { drift: true } })));
  await page.clock.install({ time: new Date(2026, 9, 21, 10, 0, 0) });
  // Low rolls, so this talk is one that may change their tie.
  await page.addInitScript(() => {
    let n = 0;
    Math.random = () => 0.01 + ((n++ * 0.0137) % 0.2);
  });
  mockAI.reply((req) => (req.prompt.includes("Write a text conversation between") ? `${TALK}\nKai: so... are we a thing now?\nAria: yes, idiot\nTIE: your boyfriend | your girlfriend` : "Mock reply"));
  await openRoute(page, "/");
  await expect(page.getByRole("link", { name: /^AR Aria/ })).toBeVisible({ timeout: 30_000 });
  await patchCharacter(page, ARIA.id, { knowsAbout: [KAI.id], ties: [{ withId: KAI.id, tie: "your friend" }] });
  await patchCharacter(page, KAI.id, { knowsAbout: [ARIA.id], ties: [{ withId: ARIA.id, tie: "your friend" }] });
  await page.reload();
  await page.clock.fastForward(40_000);
  await expect(page.getByText("Kai is now Aria's boyfriend (was friend)")).toBeVisible({ timeout: 15_000 });
  const ask = mockAI.requests.find((r) => r.prompt.includes("Write a text conversation between"))!.prompt;
  expect(ask).toContain("TIE: <what Kai is to Aria now> | <what Aria is to Kai now>");

  await openRoute(page, "/worlds/mine/timeline");
  await expect(page.getByRole("list", { name: "World timeline" })).toContainText("Kai is now Aria's boyfriend (was friend)");
});
