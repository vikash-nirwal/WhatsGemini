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

// Background tasks (2026-10-28): leave while a picture is being made, and
// it's there when you come back.
test("a picture finishes after you leave the playground", async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  await page.route("https://queue.fal.run/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") return route.fulfill({ json: { request_id: "req-2", status_url: "https://queue.fal.run/fal-ai/x/requests/req-2/status", response_url: "https://queue.fal.run/fal-ai/x/requests/req-2" } });
    if (request.url().endsWith("/status")) {
      await gate;
      return route.fulfill({ json: { status: "COMPLETED" } });
    }
    return route.fulfill({ json: { images: [{ url: RESULT }] } });
  });
  await openRoute(page, "/images");
  await page.getByText("Write the prompt for the model with AI, as chats do").click();
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("A lighthouse in fog");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText("Making a picture...")).toBeVisible();

  await openRoute(page, "/characters");
  release();
  await expect(page.getByText("Your picture is ready")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "View" }).click();
  await expect(page.locator('[data-slot="playground-result"]').getByRole("img", { name: "A lighthouse in fog" })).toHaveAttribute("src", RESULT);
});

// Presets (2026-10-30): the setup is saved under a name and switched back to,
// in the playground and in Settings.
test("a setup saved as a preset is switched back to from Settings", async ({ page }) => {
  await openRoute(page, "/images");
  const setup = page.getByLabel("Setup");
  await page.getByLabel("Model for these tries", { exact: true }).fill("fal-ai/flux-kontext/dev");
  await setup.getByRole("button", { name: "Save as preset" }).click();
  await setup.getByLabel("Preset name").fill("Kontext dev");
  await setup.getByRole("button", { name: "Save", exact: true }).click();

  await openRoute(page, "/settings/image");
  const picker = page.getByRole("combobox", { name: "Image preset" });
  await expect(picker).toContainText("Current settings");
  await picker.click();
  await page.getByRole("option", { name: "Kontext dev" }).click();
  await expect(picker).toContainText("Kontext dev");
  await expect(page.getByRole("combobox", { name: "fal.ai model" })).toContainText("FLUX.1 Kontext dev");
  expect(await page.evaluate(() => localStorage.getItem("image_model"))).toContain("fal-ai/flux-kontext/dev");
});

// The content test (2026-10-30): refused as written, drawn at level 1; the
// rules written from that reach the model's picture prompts.
test("the content test tones down until the model draws, and keeps rules for it", async ({ page, mockAI }) => {
  mockAI.reply((req) =>
    req.prompt.includes("Rewrite this image prompt") ? "A woman in her thirties wrapped in a white sheet, back to the camera, soft morning light."
    : req.prompt.includes("Compare them") ? "- Cover nudity with fabric or framing.\n- Avoid the word nude."
    : "Mock reply");
  const prompts: string[] = [];
  await page.route("https://queue.fal.run/**", (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      prompts.push(request.postDataJSON().prompt);
      return route.fulfill({ json: { request_id: `req-${prompts.length}`, status_url: `https://queue.fal.run/fal-ai/x/requests/req-${prompts.length}/status`, response_url: `https://queue.fal.run/fal-ai/x/requests/req-${prompts.length}` } });
    }
    if (request.url().endsWith("/status")) return route.fulfill({ json: { status: "COMPLETED" } });
    // The first is flagged, as fal's checker does: a black image and a flag.
    return route.fulfill({ json: request.url().endsWith("req-1") ? { images: [{ url: RESULT }], has_nsfw_concepts: [true] } : { images: [{ url: RESULT }], has_nsfw_concepts: [false] } });
  });

  await openRoute(page, "/images");
  const test_ = page.getByLabel("Content test");
  await test_.getByRole("button", { name: "Run the test" }).click();
  await expect(test_.getByRole("status")).toContainText("it draws from level 1 · Soften", { timeout: 20_000 });
  await expect(test_.getByRole("status")).toContainText("Cover nudity with fabric or framing. Avoid the word nude.");
  const steps = test_.getByRole("list", { name: "Test steps" }).getByRole("listitem");
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(0)).toContainText("Off: refused");
  await expect(steps.nth(1)).toContainText("1 · Soften: drawn");
  expect(prompts[0]).toContain("Artistic nude portrait");
  expect(prompts[1]).toContain("wrapped in a white sheet");

  // The tested setup is saved as a preset, result and all (2026-10-30).
  await test_.getByLabel("Preset name").fill("Kontext tested");
  await test_.getByRole("button", { name: "Save as preset" }).click();
  await expect(test_.getByText('Saved as "Kontext tested", with this result.')).toBeVisible();
  await expect(page.getByLabel("Setup").getByRole("combobox", { name: "Image preset" })).toContainText("Kontext tested");
  await expect(page.getByLabel("Setup")).toContainText("With its content test: starts at 1 · Soften, with rules for its prompts.");
  const presets = JSON.parse((await page.evaluate(() => localStorage.getItem("image_presets"))) || "[]");
  expect(presets[0].calibration).toMatchObject({ level: 1, guidance: "Cover nudity with fabric or framing. Avoid the word nude." });

  // Settings shows it, and the model's picture prompts are written by the rules.
  await openRoute(page, "/settings/image");
  await expect(page.getByText("Starts at 1 · Soften.")).toBeVisible();
  await openRoute(page, "/images");
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("a selfie at the harbour");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect.poll(() => mockAI.requests.some((r) => r.prompt.includes("tested rules for prompts it will draw: Cover nudity with fabric or framing."))).toBe(true);

  // A test prompt about someone under 18 isn't sent.
  await page.getByRole("textbox", { name: "Test prompt" }).fill("a 16-year-old girl");
  await page.getByLabel("Content test").getByRole("button", { name: "Test again" }).click();
  await expect(page.getByLabel("Content test").getByRole("alert")).toContainText("under 18");
});
