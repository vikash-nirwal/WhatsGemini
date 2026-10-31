import { test, expect, openRoute, editorStep, MockAIRequest } from "./fixtures";

// Reading the look from the main picture, and steering it (the user's
// request, 2026-10-31): a model that can see pictures fills Appearance and
// the locked look, a steer moves them, and Undo puts them back.

test.use({ seed: false, localStorageOverrides: { ai_model: "llava:13b" } });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
const READ = { appearance: "A tall woman in her thirties with auburn hair.", visualTags: "thirties, tall, slim, auburn hair, green eyes" };
const STEERED = { appearance: "A tall, athletic woman in her thirties with long auburn hair.", visualTags: "thirties, tall, athletic build, long auburn hair, green eyes" };

const isLookRequest = (req: MockAIRequest) => req.prompt.includes('"visualTags"') && !req.prompt.includes("roleplay AI character");
const lastUserContent = (messages: any[]) => [...messages].reverse().find((m) => m.role === "user")?.content;

test("the look is read from the picture, steered, and can be undone", async ({ page, mockAI }) => {
  mockAI.replyOnce(JSON.stringify(READ), JSON.stringify(STEERED));
  await openRoute(page, "/characters/new");
  await page.getByRole("textbox", { name: "Character Name" }).fill("Mara Voss");
  await editorStep(page, "Look");

  const helper = page.getByRole("group", { name: "Look helper" });
  const read = helper.getByRole("button", { name: "Read the look from the picture" });
  await expect(read).toBeDisabled();

  await page.locator('input[type="file"][multiple]').setInputFiles({ name: "mara.png", mimeType: "image/png", buffer: PNG });
  const crop = page.getByRole("dialog", { name: "Crop Portrait" });
  // The first picture opens the crop; keeping it as it is is enough here.
  await expect(crop).toBeVisible();
  await crop.getByRole("button", { name: "Cancel" }).click();
  await expect(crop).toBeHidden();

  await read.click();
  const appearance = page.getByPlaceholder(/Character Appearance/);
  const locked = page.getByRole("textbox", { name: "Locked look for pictures" });
  await expect(appearance).toHaveValue(READ.appearance);
  await expect(locked).toHaveValue(READ.visualTags);

  // The picture went to the model, and the name didn't.
  const first = mockAI.requests.filter(isLookRequest)[0];
  expect(first.prompt).toContain("attached picture");
  expect(first.prompt).not.toContain("Mara");
  expect(lastUserContent(first.messages).some((p: any) => p.type === "image_url")).toBe(true);

  await helper.getByRole("textbox", { name: "Steer the look" }).fill("more athletic, longer hair");
  await helper.getByRole("button", { name: "Steer the written look" }).click();
  await expect(locked).toHaveValue(STEERED.visualTags);
  const second = mockAI.requests.filter(isLookRequest)[1];
  expect(second.prompt).toContain(`Rewrite this character's look:\n${READ.appearance}`);
  expect(second.prompt).toContain("more athletic, longer hair");

  await helper.getByRole("button", { name: "Undo" }).click();
  await expect(appearance).toHaveValue(READ.appearance);
  await expect(locked).toHaveValue(READ.visualTags);
});
