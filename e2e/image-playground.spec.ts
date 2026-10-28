import { Request } from "@playwright/test";
import { test, expect, openRoute, ARIA } from "./fixtures";

// The image playground (#238): a picture from your prompt and the reference
// photos you pick, with another model if you like, and nothing in any chat.

const REFERENCE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const RESULT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test.use({
  seed: { messages: 2 },
  localStorageOverrides: { image_provider: "fal", image_model: "fal-ai/bytedance/seedream/v4/edit", provider_api_key_fal: "test-fal-key" },
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop" && testInfo.project.name !== "iphone", "one wide and one narrow screen are enough");
});

const chatLength = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const c: any = await new Promise((r) => { const g = db.transaction("chats").objectStore("chats").get(1); g.onsuccess = () => r(g.result); });
    db.close();
    return c.content.length;
  });

test("a picture with a character's photo, as written, with another model, and no chat touched", async ({ page }) => {
  const submits: Request[] = [];
  await page.route("https://rest.fal.ai/storage/upload/initiate*", (route) => route.fulfill({ json: { upload_url: "https://v3b.fal.media/upload/ref-1", file_url: "https://v3b.fal.media/files/ref-1.png" } }));
  await page.route("https://v3b.fal.media/upload/ref-1", (route) => route.fulfill({ status: 200, body: "" }));
  await page.route("https://queue.fal.run/**", (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      submits.push(request);
      return route.fulfill({ json: { request_id: "req-1", status_url: "https://queue.fal.run/fal-ai/x/requests/req-1/status", response_url: "https://queue.fal.run/fal-ai/x/requests/req-1" } });
    }
    if (request.url().endsWith("/status")) return route.fulfill({ json: { status: "COMPLETED" } });
    return route.fulfill({ json: { images: [{ url: RESULT }] } });
  });

  // Opening a route seeds the database again, so the photo goes in after.
  await openRoute(page, `/images?character=${ARIA.id}`);
  await page.evaluate(async ({ id, image }) => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const tx = db.transaction("characters", "readwrite");
    const store = tx.objectStore("characters");
    const get = store.get(id);
    get.onsuccess = () => store.put({ ...get.result, appearanceImages: [image], visualTags: "red hair, freckles" });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  }, { id: ARIA.id, image: REFERENCE });
  const before = await chatLength(page);
  await page.reload();
  await expect(page.getByRole("group", { name: "Who's in it" }).getByRole("button", { name: /Aria/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Aria's reference photos" })).toContainText("1 of 1 photos as references");
  await page.getByText("Write the prompt for the model with AI, as chats do").click();
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("Aria at the harbour at sunset");
  await page.getByLabel("Model for these tries", { exact: true }).fill("fal-ai/bytedance/seedream/v4.5/edit");
  await page.getByRole("button", { name: "Generate" }).click();

  const result = page.locator('[data-slot="playground-result"]').first();
  await expect(result.getByRole("img", { name: "Aria at the harbour at sunset" })).toHaveAttribute("src", RESULT);
  await expect(result).toContainText("fal-ai/bytedance/seedream/v4.5/edit");
  await expect(result).toContainText("references: Aria (1)");
  await result.getByText("Prompt sent").click();
  // As written, with the locked look, and no name for the image model.
  await expect(result.locator('[data-slot="playground-prompt"]')).toContainText("the character at the harbour at sunset");
  await expect(result.locator('[data-slot="playground-prompt"]')).toContainText("red hair, freckles");
  expect(submits).toHaveLength(1);
  expect(submits[0].url()).toBe("https://queue.fal.run/fal-ai/bytedance/seedream/v4.5/edit");
  expect(submits[0].postDataJSON().image_urls).toEqual(["https://v3b.fal.media/files/ref-1.png"]);
  expect(submits[0].postDataJSON().prompt).not.toContain("Aria");

  // Without the photo, it's a text-only picture.
  await page.getByRole("button", { name: "Aria's photo 1" }).click();
  await expect(page.getByRole("group", { name: "Aria's reference photos" })).toContainText("0 of 1 photos");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.locator('[data-slot="playground-result"]')).toHaveCount(2);
  expect(submits[1].url()).toBe("https://queue.fal.run/fal-ai/bytedance/seedream/v4.5/text-to-image");

  // The chat and the settings are as they were.
  expect(await chatLength(page)).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem("image_model"))).toBe("fal-ai/bytedance/seedream/v4/edit");
});
