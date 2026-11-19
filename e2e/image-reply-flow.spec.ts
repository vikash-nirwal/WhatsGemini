import { test, expect, openChat, sendMessage, waitForReplyDone, messageBubble, messageAction, chatMessages } from "./fixtures";
import { mockComfyUI, PROMPT_ID } from "./comfyui";

// A picture reply from start to finish (2026-11-19): regenerating it, the
// reply showing while the picture is drawn, ComfyUI's progress bar, editing
// the picture's prompt, and writing it yourself when the model won't.

test.use({
  seed: { messages: 2 },
  localStorageOverrides: { image_provider: "comfyui", comfyui_settings: JSON.stringify({ referenceTemplateId: "sdxl-faceid", textTemplateId: "sdxl-txt2img" }) },
});
test.skip(({ isMobile }) => isMobile, "the hover toolbar is desktop's");

const SCENE = (reply: string) => `SCENE:\nA woman at the beach at sunset, waving, upper body.\n\nREPLY:\n${reply} [Image Context: the beach]`;

test("a regenerated picture reply has its picture", async ({ page, mockAI }) => {
  await mockComfyUI(page);
  mockAI.replyOnce(SCENE("Here's me at the beach!"), "1girl, beach, sunset, waving");
  await openChat(page);
  await sendMessage(page, "/image send me a pic at the beach");
  await expect(messageBubble(page, "Here's me at the beach!").getByRole("img", { name: "Generated" })).toBeVisible({ timeout: 20_000 });
  await waitForReplyDone(page);

  await messageAction(page, "Here's me at the beach!", "Regenerate");
  await waitForReplyDone(page);
  const last = chatMessages(page).locator('[data-slot="message-bubble"]').last();
  await expect(last.getByRole("img", { name: "Generated" })).toBeVisible({ timeout: 20_000 });
});

// A selfie the character sent on its own: your message didn't ask for a
// picture, so regenerating used to come back without one.
test("a regenerated selfie the character chose to send has its picture", async ({ page, mockAI }) => {
  await mockComfyUI(page);
  await openChat(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve) => { const r = indexedDB.open("ChatAppDB"); r.onsuccess = () => resolve(r.result); });
    const tx = db.transaction("characters", "readwrite");
    const store = tx.objectStore("characters");
    const aria: any = await new Promise((resolve) => { const r = store.get(1); r.onsuccess = () => resolve(r.result); });
    store.put({ ...aria, autoSelfie: { enabled: true, frequency: 100 } });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
  });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  mockAI.replyOnce(SCENE("Just took this for you!"), "1girl, beach, sunset, waving");
  await sendMessage(page, "How's your day going?");
  await expect(messageBubble(page, "Just took this for you!").getByRole("img", { name: "Generated" })).toBeVisible({ timeout: 20_000 });
  await waitForReplyDone(page);

  await messageAction(page, "Just took this for you!", "Regenerate");
  await waitForReplyDone(page);
  await expect(chatMessages(page).locator('[data-slot="message-bubble"]').last().getByRole("img", { name: "Generated" })).toBeVisible({ timeout: 20_000 });
});

test("the reply shows while ComfyUI draws, with its progress above the message box", async ({ page, mockAI }) => {
  // The picture takes a few polls, and ComfyUI's socket reports its queue
  // and the sampler's steps meanwhile.
  await mockComfyUI(page, { pendingPolls: 8 });
  await page.routeWebSocket(/127\.0\.0\.1:8188\/ws/, (ws) => {
    const send = (type: string, data: unknown) => ws.send(JSON.stringify({ type, data }));
    setTimeout(() => send("status", { status: { exec_info: { queue_remaining: 2 } } }), 300);
    setTimeout(() => send("execution_start", { prompt_id: PROMPT_ID }), 2500);
    setTimeout(() => send("progress", { prompt_id: PROMPT_ID, value: 5, max: 20 }), 3000);
  });
  mockAI.replyOnce(SCENE("Here's me at the beach!"), "1girl, beach, sunset, waving");
  await openChat(page);
  await sendMessage(page, "/image send me a pic at the beach");

  const reply = messageBubble(page, "Here's me at the beach!");
  await expect(reply).toBeVisible({ timeout: 20_000 });
  await expect(reply.getByRole("img", { name: "Generated" })).toHaveCount(0);
  const bar = page.locator('[data-slot="image-progress"]');
  await expect(bar).toContainText("Waiting in ComfyUI's queue (1 ahead)");
  await expect(bar).toContainText("step 5 of 20", { timeout: 10_000 });
  await expect(page.getByRole("progressbar", { name: "Picture progress" })).toHaveAttribute("aria-valuenow", "25");
  await expect(reply.getByRole("img", { name: "Generated" })).toBeVisible({ timeout: 20_000 });
  await expect(bar).toHaveCount(0);
});

test("a reply's picture prompt can be changed and drawn again", async ({ page, mockAI }) => {
  const comfy = await mockComfyUI(page);
  mockAI.replyOnce(SCENE("Here's me at the beach!"), "1girl, beach, sunset, waving");
  await openChat(page);
  await sendMessage(page, "/image send me a pic at the beach");
  const reply = messageBubble(page, "Here's me at the beach!");
  await expect(reply.getByRole("img", { name: "Generated" })).toBeVisible({ timeout: 20_000 });
  await waitForReplyDone(page);

  await messageAction(page, reply, "Edit", { exact: true });
  const dialog = page.getByRole("dialog", { name: "Edit Message" });
  const prompt = dialog.getByLabel("Picture prompt");
  await expect(prompt).toHaveValue("1girl, beach, sunset, waving");
  await prompt.fill("1girl, beach at night, stars, waving");
  await dialog.getByRole("button", { name: "Save Changes" }).click();

  await expect.poll(() => comfy.requests.filter((r) => r.path === "/prompt").length, { timeout: 20_000 }).toBe(2);
  const texts = Object.values(comfy.requests.filter((r) => r.path === "/prompt")[1].body.prompt as Record<string, { inputs: Record<string, unknown> }>).map((n) => n.inputs.text);
  expect(texts).toContain("1girl, beach at night, stars, waving");
  await expect(reply.getByRole("img", { name: "Generated" })).toBeVisible();
});

test("a picture whose prompt the model refused can be written by hand", async ({ page, mockAI }) => {
  const comfy = await mockComfyUI(page);
  mockAI.replyOnce("I'm sorry, but I can't help with that request.");
  await openChat(page);
  await sendMessage(page, "/image send me a pic at the beach");
  const notice = page.locator('[data-slot="picture-refused"]');
  await expect(notice).toBeVisible({ timeout: 20_000 });
  expect(comfy.requests.filter((r) => r.path === "/prompt")).toHaveLength(0);

  await notice.getByRole("button", { name: "Write the prompt yourself" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Message" });
  await dialog.getByLabel("Picture prompt").fill("1girl, beach, sunset, waving");
  await dialog.getByRole("button", { name: "Save Changes" }).click();

  await expect(chatMessages(page).getByRole("img", { name: "Generated" })).toBeVisible({ timeout: 20_000 });
  await expect(notice).toHaveCount(0);
  await expect(chatMessages(page)).not.toContainText("wouldn't write the prompt for this picture");
});
