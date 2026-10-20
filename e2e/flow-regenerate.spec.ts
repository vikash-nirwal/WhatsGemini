import { test, expect, openChat, sendMessage, messageBubble, waitForReplyDone, PHONE_REDESIGN_SKIP } from "./fixtures";

test.skip(({ isMobile }) => isMobile, PHONE_REDESIGN_SKIP);
test.use({ seed: { messages: 3 } });

test("regenerate a reply, then page between the two variants", async ({ page, mockAI }) => {
  mockAI.replyOnce("The first take on it.", "A second, different take.");
  await openChat(page, 1);

  await sendMessage(page, "What do you think?");
  await expect(page.getByText("The first take on it.")).toBeVisible();
  await waitForReplyDone(page);

  const first = messageBubble(page, "The first take on it.");
  await first.hover();
  await first.getByRole("button", { name: "Regenerate" }).click();
  await expect(page.getByText("A second, different take.")).toBeVisible();
  await expect(page.getByText("The first take on it.")).toHaveCount(0);
  await waitForReplyDone(page);
  // The regenerate asked the same question again.
  expect(mockAI.requests).toHaveLength(2);
  expect(mockAI.requests[1].prompt).toContain("What do you think?");

  // The new variant is shown, with the older one a step back.
  const second = messageBubble(page, "A second, different take.");
  await expect(second.getByText("2/2")).toBeVisible();
  await expect(second.getByRole("button", { name: "Next variant" })).toHaveCount(0);
  await second.getByRole("button", { name: "Previous variant" }).click();
  await expect(page.getByText("The first take on it.")).toBeVisible();
  await expect(page.getByText("A second, different take.")).toHaveCount(0);
  await expect(first.getByText("1/2")).toBeVisible();

  await first.getByRole("button", { name: "Next variant" }).click();
  await expect(page.getByText("A second, different take.")).toBeVisible();
  await expect(second.getByText("2/2")).toBeVisible();
  // Paging is local: no extra requests.
  expect(mockAI.requests).toHaveLength(2);
});
