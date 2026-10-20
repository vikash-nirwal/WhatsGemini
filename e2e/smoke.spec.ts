import { test, expect, openChat, sendMessage } from "./fixtures";

test("send a message and get the mocked reply", async ({ page, mockAI }) => {
  mockAI.replyOnce("Hello from the mock, nice to meet you!");
  await openChat(page, 1);

  // The seeded history is there.
  await expect(page.getByText("Aria message 29: how was your day?")).toBeVisible();

  await sendMessage(page, "Tell me something nice.");
  await expect(page.getByText("Tell me something nice.")).toBeVisible();
  await expect(page.getByText("Hello from the mock, nice to meet you!")).toBeVisible();

  // The request went through the streamed path with the user's text in it.
  expect(mockAI.requests[0].stream).toBe(true);
  expect(mockAI.requests[0].messages.map((m) => m.content).join("\n")).toContain("Tell me something nice.");

  // Both messages were saved: they're still there after a full reload.
  await expect(page.getByRole("button", { name: "Stop Generating" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Tell me something nice.")).toBeVisible();
  await expect(page.getByText("Hello from the mock, nice to meet you!")).toBeVisible();
  expect(mockAI.requests).toHaveLength(1);
});

test.describe("with a group room", () => {
  test.use({ seed: { room: true } });

  test("the room opens with both characters' messages", async ({ page }) => {
    await openChat(page, 2);
    await expect(page.getByText("Kai: Don't touch anything.")).toBeVisible();
    await expect(page.getByText("Aria: Welcome to the garage!")).toBeVisible();
  });
});
