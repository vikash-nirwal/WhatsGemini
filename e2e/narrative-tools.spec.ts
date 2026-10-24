import { test, expect, openChat, chatMessages } from "./fixtures";
import type { Page } from "@playwright/test";

// Narrative tools: "Write my reply" (#15) and "Surprise me" (#18).

test.use({ seed: { messages: 6 } });

const chatAction = async (page: Page, name: string | RegExp) => {
  const direct = page.getByRole("button", { name });
  if (await direct.first().isVisible()) return direct.first().click();
  await page.getByRole("button", { name: /more/i }).last().click();
  await page.getByRole("menuitem", { name }).click();
};

// "Write my reply" sits in the composer's "+" menu on every screen size.
const composerTool = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Composer options" }).click();
  await page.getByRole("menuitemcheckbox", { name }).click();
};

test("Write my reply puts an editable draft in the box", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.stream ? "Mock reply" : "User: *grins* I'd love that, lead the way."));
  await openChat(page, 1);
  await composerTool(page, "Write my reply");
  const input = page.getByLabel("Message input");
  await expect(input).toHaveValue("*grins* I'd love that, lead the way.");
  const draftRequest = mockAI.requests.find((r) => !r.stream)!;
  expect(draftRequest.prompt).toContain("next message");
  // Nothing was sent: it's only a draft.
  expect(mockAI.requests.filter((r) => r.stream)).toHaveLength(0);
});

test("Surprise me asks the next reply for a twist", async ({ page, mockAI }) => {
  mockAI.reply("A stranger bursts through the door.");
  await openChat(page, 1);
  await chatAction(page, /Surprise me/);
  await expect(chatMessages(page).getByText("A stranger bursts through the door.")).toBeVisible();
  const sent = mockAI.requests.filter((r) => r.stream).pop()!;
  expect(sent.messages.map((m) => String(m.content)).join("\n")).toContain("introduce an unexpected but fitting development");
});

test("author's note presets add and remove their line, and reach the next reply", async ({ page, mockAI }) => {
  mockAI.reply("Mock reply");
  await openChat(page, 1);
  await chatAction(page, "Scene & chat settings");
  const slowBurn = page.getByRole("button", { name: "Slow burn" });
  await slowBurn.click();
  await expect(slowBurn).toHaveAttribute("aria-pressed", "true");
  const note = page.getByPlaceholder("Keep it slow and sensory…");
  await expect(note).toHaveValue(/Pace the relationship slowly/);
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await page.getByLabel("Message input").fill("Hello again.");
  await page.getByRole("button", { name: "Send Message" }).click();
  await expect(chatMessages(page).getByText("Mock reply")).toBeVisible();
  expect(mockAI.requests.filter((r) => r.stream).pop()!.prompt).toContain("Pace the relationship slowly");

  await chatAction(page, "Scene & chat settings");
  await page.getByRole("button", { name: "Slow burn" }).click();
  await expect(note).toHaveValue("");
});

test("reply suggestions appear after a reply and fill the box when tapped", async ({ page, mockAI }) => {
  mockAI.reply((req) => (req.stream ? "Shall we go to the market?" : req.prompt.includes("Suggest 3") ? "1. Yes, let's go!\n2. Only if you're buying.\n3. What's at the market?" : "NONE"));
  await openChat(page, 1);
  await chatAction(page, "Scene & chat settings");
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page.getByRole("switch", { name: "Suggest replies" }).click();
  await page.getByRole("button", { name: "Close scene panel" }).click();

  await page.getByLabel("Message input").fill("I'm bored.");
  await page.getByRole("button", { name: "Send Message" }).click();
  const group = page.getByRole("group", { name: "Reply suggestions" });
  await expect(group).toBeVisible();
  await group.getByRole("button", { name: "Only if you're buying." }).click();
  await expect(page.getByLabel("Message input")).toHaveValue("Only if you're buying.");
});
