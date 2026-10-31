import { test, expect, openRoute, openChat, chatMessages } from "./fixtures";

// Your profile and your own statuses (#116, #117): an About line the
// characters know, and statuses they see, like, comment on and reply to.

test.use({ seed: { messages: 4 } });

test("a status you post is seen, liked and replied to in private", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 9, 0, 0) });
  mockAI.reply((req) =>
    req.prompt.includes("just posted a status")
      ? '[{"name": "Aria", "view": true, "like": true, "comment": "Looks amazing!", "reply": "wait, where is that??"}]'
      : "Mock reply"
  );
  await openRoute(page, "/updates");
  const mine = page.getByRole("region", { name: "My status" });
  await mine.getByRole("button", { name: "Add a status" }).click();
  const dialog = page.getByRole("dialog", { name: "New status" });
  await dialog.getByLabel("Status text").fill("Sunset at the pier");
  await dialog.getByRole("button", { name: "Post" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => mockAI.requests.filter((r) => r.prompt.includes("just posted a status")).length).toBe(1);
  expect(mockAI.requests.find((r) => r.prompt.includes("just posted a status"))?.prompt).toContain('"Sunset at the pier"');

  // Within 45 minutes Aria has seen it, liked it and commented.
  await page.clock.fastForward(45 * 60_000);
  await mine.getByRole("button", { name: "View my status" }).click();
  const viewer = page.getByRole("dialog", { name: "My status" });
  await viewer.getByRole("tab", { name: "Seen by 1" }).click();
  await expect(viewer.getByRole("list", { name: "Seen by" })).toContainText("Aria");
  await expect(viewer.getByLabel("liked it")).toBeVisible();
  await viewer.getByRole("tab", { name: "Comments 1" }).click();
  await expect(viewer.getByRole("list", { name: "Comments" })).toContainText("Looks amazing!");
  // You can answer her comment, and she answers back (2026-10-27).
  mockAI.reply((req) => (req.prompt.includes('replied to Aria: "thanks! you should come next time"') ? "deal, save me a spot" : "Mock reply"));
  await viewer.getByRole("button", { name: "Reply to Aria" }).click();
  await viewer.getByRole("textbox", { name: "Your reply to Aria" }).fill("thanks! you should come next time");
  await viewer.getByRole("button", { name: "Send" }).click();
  await expect(viewer.getByRole("list", { name: "Comments" })).toContainText("thanks! you should come next time");
  await expect(viewer.getByRole("list", { name: "Comments" })).toContainText("deal, save me a spot");
  await page.keyboard.press("Escape");

  // Her private reply reaches your chat, quoting the status, and she knows it.
  await openChat(page);
  await expect(chatMessages(page).getByText("wait, where is that??")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-slot="quoted-status"]')).toContainText("Sunset at the pier");
  mockAI.reply("Mock reply");
  await page.getByLabel("Message input").fill("the old pier!");
  await page.getByLabel("Message input").press("Enter");
  await expect.poll(() => mockAI.requests.filter((r) => r.stream).length).toBe(1);
  const system = mockAI.requests.filter((r) => r.stream)[0].messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("and you've seen it: \"Sunset at the pier\"");
});

test("your About line is on your profile and in the prompt", async ({ page, mockAI }) => {
  await openRoute(page, "/settings/profile");
  await page.getByRole("button", { name: "Add persona" }).click();
  await page.getByPlaceholder("Persona name (e.g. Myself, Elven Mage)").fill("Sam");
  await page.getByLabel("About", { exact: true }).fill("Busy, coffee first");
  await openChat(page);
  await page.getByLabel("Message input").fill("hey");
  await page.getByLabel("Message input").press("Enter");
  await expect.poll(() => mockAI.requests.filter((r) => r.stream).length).toBe(1);
  const system = mockAI.requests.filter((r) => r.stream)[0].messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain('User\'s About line on their profile: "Busy, coffee first".');
});

// A model's answer that isn't usable no longer leaves a status unseen: the
// watcher tries again, and reads the loose shapes real models write.
test("a status whose first decision failed is retried, and still seen", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 9, 0, 0) });
  let asked = 0;
  mockAI.reply((req) => {
    if (!req.prompt.includes("just posted a status")) return "Mock reply";
    asked += 1;
    return asked === 1 ? "Sorry, I can't do that right now." : 'Here:\n```json\n[{"name": "aria", "view": "true", "like": "yes"},]\n```';
  });
  await openRoute(page, "/updates");
  const mine = page.getByRole("region", { name: "My status" });
  await mine.getByRole("button", { name: "Add a status" }).click();
  const dialog = page.getByRole("dialog", { name: "New status" });
  await dialog.getByLabel("Status text").fill("Rainy Sunday");
  await dialog.getByRole("button", { name: "Post" }).click();
  await expect.poll(() => asked).toBe(1);
  // The watcher picks it up again within a minute.
  await page.clock.fastForward(60_000);
  await expect.poll(() => asked, { timeout: 15_000 }).toBe(2);
  await page.clock.fastForward(45 * 60_000);
  await mine.getByRole("button", { name: "View my status" }).click();
  const viewer = page.getByRole("dialog", { name: "My status" });
  await viewer.getByRole("tab", { name: "Seen by 1" }).click();
  await expect(viewer.getByRole("list", { name: "Seen by" })).toContainText("Aria");
  await expect(viewer.getByLabel("liked it")).toBeVisible();
});

// A status stays in the world you posted it in (the user's report,
// 2026-10-28: it showed in every world).
test("a status posted in one world isn't shown in another", async ({ page, mockAI }) => {
  mockAI.reply("[]");
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();

  await openRoute(page, "/updates");
  const mine = page.getByRole("region", { name: "My status" });
  await mine.getByRole("button", { name: "Add a status" }).click();
  const dialog = page.getByRole("dialog", { name: "New status" });
  await dialog.getByLabel("Status text").fill("Fog over the harbour");
  await dialog.getByRole("button", { name: "Post" }).click();
  await expect(dialog).toBeHidden();
  await expect(mine.getByRole("button", { name: "View my status" })).toBeVisible();

  // In My world there's nothing of yours to view.
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Switch to Default" }).click();
  await openRoute(page, "/updates");
  await expect(mine.getByRole("button", { name: "Add a status" })).toBeVisible();
  await expect(mine.getByRole("button", { name: "View my status" })).toHaveCount(0);
});
