import type { Page } from "@playwright/test";
import { test, expect, openChat, sendMessage, waitForReplyDone, messageBubble, PHONE_REDESIGN_SKIP } from "./fixtures";

// Send them a photo (#48): a vision model gets the photo itself; otherwise
// a vision-capable helper describes it; otherwise the character is told
// there's a photo it can't see.

test.use({ seed: { messages: 2 } });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

const attachPhoto = async (page: Page) => {
  await page.getByTestId("photo-input").setInputFiles({ name: "beach.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("group", { name: "Attached photos" }).getByRole("img", { name: "Attachment 1" })).toBeVisible();
};

const lastUserContent = (messages: any[]) => [...messages].reverse().find((m) => m.role === "user")?.content;

test.describe("with a vision model", () => {
  test.use({ localStorageOverrides: { ai_model: "llava:13b" } });

  test("the photo goes to the model with the message, and shows in the chat", async ({ page, mockAI }) => {
    mockAI.reply("What a view! Where is that?");
    await openChat(page);
    await attachPhoto(page);
    await sendMessage(page, "Look where I am");
    await expect(messageBubble(page, "What a view!")).toBeVisible();
    await waitForReplyDone(page);

    const content = lastUserContent(mockAI.requests[0].messages);
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toMatchObject({ type: "image_url" });
    expect(content[0].image_url.url).toMatch(/^data:image\/(png|jpeg);base64,/);
    expect(mockAI.requests[0].prompt).toContain("[The user sent this photo with their message.]");
    expect(mockAI.requests[0].prompt).toContain("Look where I am");
    await expect(messageBubble(page, "Look where I am").getByRole("img", { name: "Sent by you" })).toBeVisible();
    // The composer is empty again.
    await expect(page.getByRole("group", { name: "Attached photos" })).toHaveCount(0);
  });

  test("a photo can be removed before sending, and sent without words", async ({ page, mockAI }) => {
    mockAI.reply("Cute!");
    await openChat(page);
    await attachPhoto(page);
    await page.getByRole("button", { name: "Remove photo 1" }).click();
    await expect(page.getByRole("group", { name: "Attached photos" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send Message" })).toBeDisabled();

    await attachPhoto(page);
    await page.getByRole("button", { name: "Send Message" }).click();
    await expect(messageBubble(page, "Cute!")).toBeVisible();
    expect(Array.isArray(lastUserContent(mockAI.requests[0].messages))).toBe(true);
  });
});

test.describe("with a text-only model and a vision helper", () => {
  test.use({ localStorageOverrides: { ai_model: "llama3.1", helper_provider: "ollama", helper_model: "llava:13b" } });

  test("the helper describes the photo, and the description is kept for later turns", async ({ page, mockAI }) => {
    mockAI.replyOnce("A golden retriever running on a sunny beach.");
    mockAI.reply("Aww, is that your dog?");
    await openChat(page);
    await attachPhoto(page);
    await sendMessage(page, "Meet my new friend");
    await expect(messageBubble(page, "is that your dog?")).toBeVisible();
    await waitForReplyDone(page);

    // First the description (with the photo), then the reply (without it).
    expect(mockAI.requests[0].prompt).toContain("Describe this photo");
    expect(Array.isArray(lastUserContent(mockAI.requests[0].messages))).toBe(true);
    expect(typeof lastUserContent(mockAI.requests[1].messages)).toBe("string");
    expect(mockAI.requests[1].prompt).toContain("[The user sent a photo. It shows: A golden retriever running on a sunny beach.]");

    await sendMessage(page, "Yes, his name is Max");
    await expect.poll(() => mockAI.requests.length).toBe(3);
    expect(JSON.stringify(mockAI.requests[2].messages)).toContain("[sent a photo: A golden retriever running on a sunny beach.]");
  });
});

test.describe("with no model that can see", () => {
  test.use({ localStorageOverrides: { ai_model: "llama3.1" } });

  test("the character is told there's a photo it can't see, and you get a hint", async ({ page, mockAI }) => {
    mockAI.reply("I can't quite see it, what is it?");
    await openChat(page);
    await attachPhoto(page);
    await sendMessage(page, "Check this out");
    await expect(messageBubble(page, "I can't quite see it")).toBeVisible();
    expect(mockAI.requests).toHaveLength(1);
    expect(mockAI.requests[0].prompt).toContain("you can't see it");
    await expect(page.getByText("This model can't see photos")).toBeVisible();
  });
});

test.describe("editing and regenerating", () => {
  test.use({ localStorageOverrides: { ai_model: "llava:13b" } });
  // Edit and regenerate sit in the hover toolbar, which phones are redesigning.
  test.skip(({ isMobile }) => isMobile, PHONE_REDESIGN_SKIP);

  test("a regenerated reply and an edited message still have the photo", async ({ page, mockAI }) => {
    mockAI.replyOnce("What a view!", "Gorgeous, where is it?", "A beach at last!");
    await openChat(page);
    await attachPhoto(page);
    await sendMessage(page, "Look where I am");
    await expect(messageBubble(page, "What a view!")).toBeVisible();
    await waitForReplyDone(page);

    const reply = messageBubble(page, "What a view!");
    await reply.hover();
    await reply.getByRole("button", { name: "Regenerate" }).click();
    await expect(messageBubble(page, "Gorgeous, where is it?")).toBeVisible();
    await waitForReplyDone(page);
    expect(Array.isArray(lastUserContent(mockAI.requests[1].messages))).toBe(true);

    const mine = messageBubble(page, "Look where I am");
    await mine.hover();
    await mine.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Message" });
    await dialog.getByRole("textbox").fill("Look where I am now");
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(messageBubble(page, "A beach at last!")).toBeVisible();
    await expect(messageBubble(page, "Look where I am now").getByRole("img", { name: "Sent by you" })).toBeVisible();
    expect(Array.isArray(lastUserContent(mockAI.requests[2].messages))).toBe(true);
  });
});
