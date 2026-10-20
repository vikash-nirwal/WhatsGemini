import { test, expect, openRoute, adventureReply, ADVENTURE_CHOICES, ADVENTURE_OPENING } from "./fixtures";

test.use({ seed: { adventure: true } });

test("play an adventure turn by tapping a choice", async ({ page, mockAI }) => {
  mockAI.replyOnce(adventureReply("The door groans open onto shelves of drowned books.", ["Wade inside", "Call out a greeting"]));
  await openRoute(page, "/adventures/1");
  await expect(page.getByText(ADVENTURE_OPENING)).toBeVisible({ timeout: 30_000 });

  const choice = page.getByRole("button", { name: ADVENTURE_CHOICES[0].label });
  await expect(choice).toBeVisible();
  await choice.click();

  // The narrator's next turn arrives with its own fresh choices, and the
  // old ones are gone.
  await expect(page.getByText("The door groans open onto shelves of drowned books.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Wade inside" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Call out a greeting" })).toBeVisible();
  await expect(page.getByRole("button", { name: ADVENTURE_CHOICES[1].label })).toHaveCount(0);
  // The tapped choice is now the player's move, sent as the prompt.
  await expect(page.getByText(ADVENTURE_CHOICES[0].label)).toBeVisible();
  expect(mockAI.requests).toHaveLength(1);
  expect(mockAI.requests[0].prompt).toContain(ADVENTURE_CHOICES[0].label);
});
