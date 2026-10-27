import { test, expect, openRoute, openChat, chatMessages } from "./fixtures";

// Pass the time for a whole world (the user's ask, 2026-10-26): every chat
// there gets the gap, and the people you talk to most text first.

test.use({ seed: { messages: 3, room: true } });

test("time passes for the whole world, and someone texts first", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.prompt.includes("have passed since your last conversation") ? "hey stranger. two weeks, huh?" : "Mock reply"));
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Pass the time" }).click();
  const dialog = page.getByRole("dialog", { name: "Pass the time in My world" });
  await dialog.getByRole("spinbutton", { name: "How long" }).fill("2");
  await dialog.getByRole("radio", { name: "weeks" }).click();
  await dialog.getByRole("textbox", { name: "What happened meanwhile" }).fill("a storm cut the power");
  await dialog.getByRole("button", { name: "Pass 2 weeks" }).click();
  await expect(page.getByText("2 weeks later in My world · 1 texted you")).toBeVisible();
  expect(mockAI.requests.find((r) => r.prompt.includes("have passed since"))!.prompt).toContain("meanwhile: a storm cut the power");

  await openChat(page, 1);
  await expect(page.getByText("⏳ 2 weeks later")).toBeVisible();
  await expect(chatMessages(page).getByText("hey stranger. two weeks, huh?")).toHaveCount(1);
  await openChat(page, 2);
  await expect(page.getByText("⏳ 2 weeks later")).toBeVisible();

  await openRoute(page, "/worlds/mine/timeline");
  await expect(page.getByRole("list", { name: "World timeline" })).toContainText("2 weeks passed for everyone: a storm cut the power");
});

// #180: a long gap ages the world - each life moves on, and the people who
// text first bring their own news.
test("years later, lives have moved on", async ({ page, mockAI }) => {
  mockAI.reply((req) =>
    req.prompt.includes("have just passed there") ? "LIFE: Aria | Aria opened a bakery by the pier."
      : req.prompt.includes("have passed since your last conversation") ? (req.prompt.includes("Meanwhile in your life: Aria opened a bakery") ? "I have a bakery now. can you believe it" : "hey")
      : "Mock reply"
  );
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Pass the time" }).click();
  const dialog = page.getByRole("dialog", { name: "Pass the time in My world" });
  await dialog.getByRole("spinbutton", { name: "How long" }).fill("3");
  await dialog.getByRole("radio", { name: "years" }).click();
  await dialog.getByRole("button", { name: "Pass 3 years" }).click();
  await expect(page.getByText("3 years later in My world · 1 texted you")).toBeVisible();
  await openChat(page, 1);
  await expect(chatMessages(page).getByText("I have a bakery now. can you believe it")).toHaveCount(1);
  await openRoute(page, "/worlds/mine/timeline");
  await expect(page.getByRole("list", { name: "World timeline" })).toContainText("Aria opened a bakery by the pier.");
});

// #189: the last world-wide skip can be undone while nothing has happened since.
test("a time skip can be undone", async ({ page, mockAI }) => {
  // Quiet hours all day: a background text after the skip would rightly
  // stop the undo (the story moved on), so none may arrive here.
  await page.addInitScript(() => localStorage.setItem("world_prefs", JSON.stringify({ mine: { quietHours: [0, 24] } })));
  mockAI.reply((req) => (req.prompt.includes("have just passed there") ? "LIFE: Aria | Aria opened a bakery by the pier." : "Mock reply"));
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Pass the time" }).click();
  let dialog = page.getByRole("dialog", { name: "Pass the time in My world" });
  await dialog.getByRole("spinbutton", { name: "How long" }).fill("3");
  await dialog.getByRole("radio", { name: "years" }).click();
  await dialog.getByRole("switch").click(); // nobody texts first
  await dialog.getByRole("button", { name: "Pass 3 years" }).click();
  await expect(page.getByText("3 years later in My world").first()).toBeVisible();

  await page.getByRole("button", { name: "Pass the time" }).click();
  dialog = page.getByRole("dialog", { name: "Pass the time in My world" });
  await dialog.getByRole("button", { name: "Undo the last skip (3 years)" }).click();
  await expect(page.getByText("Time skip undone")).toBeVisible();
  await openChat(page, 1);
  await expect(page.getByText("⏳ 3 years later")).toHaveCount(0);
  await openRoute(page, "/worlds/mine/timeline");
  await expect(page.getByText("Nothing has happened here yet.", { exact: false })).toBeVisible();
});
