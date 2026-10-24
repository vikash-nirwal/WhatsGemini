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
  await expect(viewer.getByText("Seen by 1")).toBeVisible();
  await viewer.getByText("Seen by 1").click();
  await expect(viewer.getByRole("list", { name: "Seen by" })).toContainText("Aria");
  await expect(viewer.getByLabel("liked it")).toBeVisible();
  await expect(viewer.getByRole("list", { name: "Comments" })).toContainText("Looks amazing!");
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
