import { test, expect, openRoute, MockAIRequest } from "./fixtures";

// Character from a photo (#92): a picture goes with the idea dialog's draft
// request to a model that can see it; the draft fills the editor, and the
// photo can become the portrait.

test.use({ seed: false });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

const NELL = {
  name: "Nell Harrow",
  description: "A lighthouse keeper with paint on her sleeves.",
  personalityTraits: ["calm", "wry"],
  prompt: "You are Nell Harrow, who keeps the lighthouse and paints the sea.",
  scenario: "The lamp room at dusk.",
  firstMessage: "*wipes her brush* Mind the wet paint.",
  alternateGreetings: [],
  exampleDialogue: "User: Busy?\nNell Harrow: Always. Sit.",
  relationship: "New neighbour",
  appearance: "Short grey hair, a paint-flecked fisherman's sweater.",
  visualTags: "sixties, short grey hair, weathered face, paint-flecked sweater",
};

const isDraftRequest = (req: MockAIRequest) => req.prompt.includes("roleplay AI character");
const lastUserContent = (messages: any[]) => [...messages].reverse().find((m) => m.role === "user")?.content;

const openIdeaDialog = async (page: import("@playwright/test").Page) => {
  await openRoute(page, "/characters");
  await page.getByRole("button", { name: "Create from an idea" }).click();
  const dialog = page.getByRole("dialog", { name: "Create from an idea" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
};

test.describe("with a vision model", () => {
  test.use({ localStorageOverrides: { ai_model: "llava:13b" } });

  test("a photo alone drafts the character, and can become the portrait", async ({ page, mockAI }) => {
    mockAI.reply(JSON.stringify(NELL));
    const dialog = await openIdeaDialog(page);
    await dialog.getByTestId("idea-photo-input").setInputFiles({ name: "nell.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog.getByRole("img", { name: "What the draft starts from" })).toBeVisible();
    await dialog.getByRole("button", { name: "Draft character" }).click();
    await expect(dialog).toBeHidden();

    const sent = mockAI.requests.filter(isDraftRequest);
    expect(sent).toHaveLength(1);
    const content = lastUserContent(sent[0].messages);
    expect(Array.isArray(content)).toBe(true);
    expect(content.some((p: any) => p.type === "image_url" && /^data:image\//.test(p.image_url.url))).toBe(true);
    expect(sent[0].prompt).toContain("attached photo");
    expect(sent[0].prompt).not.toContain("Idea:");

    await expect(page.getByText("Drafted from your photo")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue(NELL.name);
    await expect(page.getByRole("textbox", { name: "Locked look for pictures" })).toHaveValue(NELL.visualTags);

    await page.getByRole("button", { name: "Use the photo as the portrait" }).click();
    await expect(page.getByRole("dialog", { name: "Crop Portrait" })).toBeVisible();
  });

  test("a photo can be removed, and then an idea is needed again", async ({ page }) => {
    const dialog = await openIdeaDialog(page);
    await dialog.getByTestId("idea-photo-input").setInputFiles({ name: "nell.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByRole("button", { name: "Remove photo" }).click();
    await expect(dialog.getByRole("img", { name: "What the draft starts from" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Draft character" }).click();
    await expect(dialog.getByText("Describe the character in a few words, or add a photo.")).toBeVisible();
  });
});

test.describe("with a text-only chat model and a vision helper", () => {
  test.use({ localStorageOverrides: { ai_model: "llama3.1", helper_provider: "ollama", helper_model: "llava:13b" } });

  test("the helper drafts from the photo", async ({ page, mockAI }) => {
    mockAI.reply(JSON.stringify(NELL));
    const dialog = await openIdeaDialog(page);
    await dialog.getByTestId("idea-photo-input").setInputFiles({ name: "nell.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByRole("button", { name: "Draft character" }).click();
    await expect(dialog).toBeHidden();
    expect(mockAI.requests.filter(isDraftRequest).map((r) => r.model)).toEqual(["llava:13b"]);
  });
});

test.describe("with no model that can see", () => {
  test.use({ localStorageOverrides: { ai_model: "llama3.1" } });

  test("the dialog says so instead of drafting", async ({ page, mockAI }) => {
    const dialog = await openIdeaDialog(page);
    await dialog.getByTestId("idea-photo-input").setInputFiles({ name: "nell.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByRole("button", { name: "Draft character" }).click();
    await expect(dialog.getByRole("alert")).toContainText("can't see pictures");
    expect(mockAI.requests.filter(isDraftRequest)).toHaveLength(0);
  });
});
