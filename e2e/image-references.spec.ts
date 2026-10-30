import { Page, Request } from "@playwright/test";
import { test, expect, openChat, openRoute, editorStep, sendMessage, waitForReplyDone, ARIA, chatMessages } from "./fixtures";
import { mockComfyUI } from "./comfyui";

// #36-#41: a character's appearance photo reaches each image provider as a
// reference, along with the locked look and, for local providers, the
// character's own seed and LoRA. The provider's HTTP endpoints are mocked with page.route, so
// what's checked is the request the browser actually sends.

// A 1x1 PNG. Small enough that the app sends it as is (it only downscales
// images over 512px), so the exact bytes can be looked for in each request.
const REFERENCE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const REFERENCE_BYTES = Buffer.from(REFERENCE_PNG, "base64");
// What the provider "draws": a different 1x1 PNG, shown in the chat.
const RESULT_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const RESULT_DATA_URL = `data:image/png;base64,${RESULT_PNG}`;

// The image-prompt step asks the chat model for a PROMPT and a SUMMARY; the
// summary becomes Aria's reply.
const DERIVATION_REPLY = "PROMPT:\nAria waving at the camera, selfie\n\nSUMMARY:\nHere's me right now! [Image Context: Aria waving]";

// Gives Aria an appearance photo, plus any other fields. Runs on the app's
// origin, after the fixture has created and seeded the database.
const addAppearanceImage = async (page: Page, extra: Record<string, unknown> = {}) => {
  await page.goto("./");
  await page.evaluate(
    async ({ id, image, extra }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("characters", "readwrite");
        const store = tx.objectStore("characters");
        const get = store.get(id);
        get.onsuccess = () => store.put({ ...get.result, appearanceImages: [image], ...extra });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id: ARIA.id, image: `data:image/png;base64,${REFERENCE_PNG}`, extra }
  );
};

const requestPictureFromAria = async (page: Page, extra: Record<string, unknown> = {}) => {
  await addAppearanceImage(page, extra);
  await openChat(page);
  await sendMessage(page, "/image a selfie please");
  // Wan polls every 5 seconds, so its picture takes a little longer.
  await expect(chatMessages(page).getByText("Here's me right now!")).toBeVisible({ timeout: 20_000 });
  await waitForReplyDone(page);
  await expect(page.getByRole("img", { name: "Generated" })).toBeVisible();
};

test.beforeEach(async ({ mockAI }, testInfo) => {
  // The request is the same on every screen size, so one browser is enough.
  test.skip(testInfo.project.name !== "desktop", "provider requests are checked on desktop only");
  mockAI.reply(DERIVATION_REPLY);
});

test.describe("fal.ai", () => {
  test.use({
    seed: { messages: 2 },
    localStorageOverrides: {
      image_provider: "fal",
      image_model: "fal-ai/bytedance/seedream/v4/edit",
      // Stored as plain text: the app reads a key it can't decrypt as is.
      provider_api_key_fal: "test-fal-key",
    },
  });

  test("Seedream edit gets the appearance photo, uploaded to fal's CDN", async ({ page }) => {
    let uploaded: Buffer | null = null;
    let submit: Request | null = null;
    await page.route("https://rest.fal.ai/storage/upload/initiate*", (route) =>
      route.fulfill({ json: { upload_url: "https://v3b.fal.media/upload/ref-1", file_url: "https://v3b.fal.media/files/ref-1.png" } })
    );
    await page.route("https://v3b.fal.media/upload/ref-1", (route) => {
      uploaded = route.request().postDataBuffer();
      return route.fulfill({ status: 200, body: "" });
    });
    await page.route("https://queue.fal.run/**", (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        submit = request;
        return route.fulfill({
          json: {
            request_id: "req-1",
            status_url: "https://queue.fal.run/fal-ai/bytedance/requests/req-1/status",
            response_url: "https://queue.fal.run/fal-ai/bytedance/requests/req-1",
          },
        });
      }
      if (request.url().endsWith("/status")) return route.fulfill({ json: { status: "COMPLETED" } });
      return route.fulfill({ json: { images: [{ url: RESULT_DATA_URL }], seed: 1 } });
    });

    await requestPictureFromAria(page);

    expect(uploaded).not.toBeNull();
    expect(Buffer.compare(uploaded!, REFERENCE_BYTES)).toBe(0);
    expect(submit!.url()).toBe("https://queue.fal.run/fal-ai/bytedance/seedream/v4/edit");
    expect(submit!.headers()["authorization"]).toBe("Key test-fal-key");
    const body = submit!.postDataJSON();
    expect(body.image_urls).toEqual(["https://v3b.fal.media/files/ref-1.png"]);
    expect(body.prompt).toContain("the character waving at the camera");
    expect(body.prompt).not.toContain("Aria");
  });

  // The user's ask, 2026-10-30: fal's checker can be switched off; it's on by default.
  test("switching the safety checker off in Settings turns it off at fal", async ({ page }) => {
    let body: any = null;
    await page.route("https://rest.fal.ai/storage/upload/initiate*", (route) =>
      route.fulfill({ json: { upload_url: "https://v3b.fal.media/upload/ref-1", file_url: "https://v3b.fal.media/files/ref-1.png" } })
    );
    await page.route("https://v3b.fal.media/upload/ref-1", (route) => route.fulfill({ status: 200, body: "" }));
    await page.route("https://queue.fal.run/**", (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        body = request.postDataJSON();
        return route.fulfill({ json: { request_id: "req-1", status_url: "https://queue.fal.run/fal-ai/bytedance/requests/req-1/status", response_url: "https://queue.fal.run/fal-ai/bytedance/requests/req-1" } });
      }
      if (request.url().endsWith("/status")) return route.fulfill({ json: { status: "COMPLETED" } });
      return route.fulfill({ json: { images: [{ url: RESULT_DATA_URL }] } });
    });

    await openRoute(page, "/settings/image");
    const checker = page.getByRole("switch", { name: "fal.ai safety checker" });
    await expect(checker).toBeChecked();
    await checker.click();
    await expect(checker).not.toBeChecked();

    await requestPictureFromAria(page);
    expect(body.enable_safety_checker).toBe(false);
  });
});

// Toning down (2026-10-27): a picture the service blocks is tried again
// toned down by the text model, keeping its idea.
test.describe("fal.ai, toned down when blocked", () => {
  test.use({
    seed: { messages: 2 },
    localStorageOverrides: { image_provider: "fal", image_model: "fal-ai/bytedance/seedream/v4/edit", provider_api_key_fal: "test-fal-key" },
  });

  test("a blocked picture is rewritten a level up and drawn", async ({ page, mockAI }) => {
    mockAI.reply((req) => (req.prompt.includes("Rewrite this image prompt") ? "Aria waving at the camera, softly lit, tasteful selfie" : DERIVATION_REPLY));
    const prompts: string[] = [];
    await page.route("https://rest.fal.ai/storage/upload/initiate*", (route) => route.fulfill({ json: { upload_url: "https://v3b.fal.media/upload/ref-1", file_url: "https://v3b.fal.media/files/ref-1.png" } }));
    await page.route("https://v3b.fal.media/upload/ref-1", (route) => route.fulfill({ status: 200, body: "" }));
    await page.route("https://queue.fal.run/**", (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        prompts.push(request.postDataJSON().prompt);
        if (prompts.length === 1) return route.fulfill({ status: 422, json: { detail: "Content policy violation: the prompt was flagged." } });
        return route.fulfill({ json: { request_id: "req-2", status_url: "https://queue.fal.run/fal-ai/bytedance/requests/req-2/status", response_url: "https://queue.fal.run/fal-ai/bytedance/requests/req-2" } });
      }
      if (request.url().endsWith("/status")) return route.fulfill({ json: { status: "COMPLETED" } });
      return route.fulfill({ json: { images: [{ url: RESULT_DATA_URL }] } });
    });

    await requestPictureFromAria(page);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("tasteful selfie");
    expect(mockAI.requests.find((r) => r.prompt.includes("Rewrite this image prompt"))!.prompt).toContain("Level 1, light");
    await expect(chatMessages(page).getByText("toned down to level 1", { exact: false })).toBeVisible();
  });
});

test.describe("OpenAI", () => {
  test.use({
    seed: { messages: 2 },
    localStorageOverrides: {
      image_provider: "openai",
      image_model: "gpt-image-1-mini",
      provider_api_key_openai: "sk-test",
    },
  });

  test("gpt-image-1-mini calls /images/edits with the appearance photo", async ({ page }) => {
    let edit: Request | null = null;
    await page.route("https://api.openai.com/v1/images/**", (route) => {
      edit = route.request();
      return route.fulfill({ json: { data: [{ b64_json: RESULT_PNG }] } });
    });

    await requestPictureFromAria(page);

    expect(edit!.url()).toBe("https://api.openai.com/v1/images/edits");
    expect(edit!.headers()["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    const body = edit!.postDataBuffer()!;
    expect(body.includes(REFERENCE_BYTES)).toBe(true);
    const text = body.toString("latin1");
    expect(text).toContain('name="image[]"; filename="reference-1.png"');
    expect(text).toContain('name="model"\r\n\r\ngpt-image-1-mini');
  });
});

test.describe("Wan", () => {
  const BASE = "https://ws-test.ap-southeast-1.maas.aliyuncs.com";
  test.use({
    seed: { messages: 2 },
    localStorageOverrides: {
      image_provider: "wan",
      image_model: "wan2.6-t2i",
      provider_api_key_wan: "sk-test",
      wan_base_url: BASE,
    },
  });

  test("the reference model (wan2.7-image) gets the appearance photo as a data URL", async ({ page }) => {
    let submit: Request | null = null;
    await page.route(`${BASE}/api/v1/**`, (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        submit = request;
        return route.fulfill({ json: { output: { task_id: "t1", task_status: "PENDING" } } });
      }
      return route.fulfill({
        json: { output: { task_status: "SUCCEEDED", choices: [{ message: { content: [{ type: "image", image: RESULT_DATA_URL }] } }] } },
      });
    });

    await requestPictureFromAria(page);

    expect(submit!.url()).toBe(`${BASE}/api/v1/services/aigc/image-generation/generation`);
    const body = submit!.postDataJSON();
    expect(body.model).toBe("wan2.7-image");
    const content = body.input.messages[0].content;
    expect(content[0].text).toContain("the character waving at the camera");
    // The app labels the reference image/jpeg; the adapter corrects it from the bytes.
    expect(content.slice(1)).toEqual([{ image: `data:image/png;base64,${REFERENCE_PNG}` }]);
  });
});

test.describe("ComfyUI", () => {
  // The SDXL workflows, picked by hand: Klein and Z-Image are the defaults.
  test.use({ seed: { messages: 2 }, localStorageOverrides: { image_provider: "comfyui", comfyui_settings: JSON.stringify({ referenceTemplateId: "sdxl-faceid", textTemplateId: "sdxl-txt2img" }) } });

  test("gets the photo, the locked look, and the character's seed and LoRA", async ({ page }) => {
    const comfy = await mockComfyUI(page);

    await requestPictureFromAria(page, {
      visualTags: "silver hair, violet eyes",
      localImageSettings: { seed: 1234, loraName: "aria_v1", loraWeight: 0.7, loraTrigger: "aria_char" },
    });

    expect(comfy.sequence()[0]).toBe("POST /upload/image");
    const nodes = Object.values(comfy.queuedWorkflow() as Record<string, { class_type: string; inputs: Record<string, any> }>);
    const texts = nodes.filter((n) => typeof n.inputs.text === "string").map((n) => n.inputs.text as string);
    // ComfyUI's SDXL workflow takes tags, so the locked look goes in as tags.
    expect(texts.some((t) => t.startsWith("aria_char, ") && t.includes("silver hair, violet eyes, ") && t.includes("the character waving at the camera"))).toBe(true);
    expect(nodes.find((n) => "seed" in n.inputs)?.inputs.seed).toBe(1234);
    expect(nodes.find((n) => "lora_name" in n.inputs)?.inputs).toMatchObject({ lora_name: "aria_v1.safetensors", strength_model: 0.7 });
    expect(nodes.find((n) => n.class_type === "LoadImage")?.inputs.image).toBe(comfy.requests[0].uploadName);
  });
});

test.describe("ComfyUI prompt writing", () => {
  // The SDXL workflows, picked by hand: Klein and Z-Image are the defaults.
  test.use({ seed: { messages: 2 }, localStorageOverrides: { image_provider: "comfyui", comfyui_settings: JSON.stringify({ referenceTemplateId: "sdxl-faceid", textTemplateId: "sdxl-txt2img" }) } });

  test("the text model writes the prompt for the workflow, even when it ignores the format", async ({ page, mockAI }) => {
    const comfy = await mockComfyUI(page);
    // The in-character call answers without SCENE/REPLY labels; the
    // prompt-writing call answers with SDXL tags.
    mockAI.replyOnce("Here's me right now! [Image Context: Aria on a beach at sunset]", "1girl, solo, Aria, beach at sunset, sundress, waving, golden hour, upper body");
    await openChat(page);
    await sendMessage(page, "/image send me a pic at the beach");
    await expect(chatMessages(page).getByText("Here's me right now!")).toBeVisible({ timeout: 20_000 });
    await waitForReplyDone(page);

    expect(mockAI.requests[1].prompt).toContain('You write prompts for an image generator: ComfyUI running the "SDXL text to image" workflow');
    expect(mockAI.requests[1].prompt).toContain("It shows: Aria on a beach at sunset");
    const texts = Object.values(comfy.queuedWorkflow() as Record<string, { inputs: Record<string, any> }>).map((n) => n.inputs.text).filter((t): t is string => typeof t === "string");
    expect(texts).toContain("1girl, solo, the character, beach at sunset, sundress, waving, golden hour, upper body");
    expect(texts.some((t) => t.includes("send me a pic at the beach"))).toBe(false);
  });
});

test.describe("Reference sheet", () => {
  test.use({
    seed: { messages: 2 },
    localStorageOverrides: { image_provider: "openai", image_model: "gpt-image-1-mini", provider_api_key_openai: "sk-test" },
  });

  test("draws three views from the locked look and adds them as references", async ({ page }) => {
    const prompts: string[] = [];
    await page.route("https://api.openai.com/v1/images/**", (route) => {
      prompts.push(route.request().postDataJSON().prompt);
      return route.fulfill({ json: { data: [{ b64_json: RESULT_PNG }] } });
    });
    // Open the editor first: opening a route seeds the database again.
    await openRoute(page, `/characters/${ARIA.id}/edit`);
    await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
    await page.evaluate(async (id) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("characters", "readwrite");
        const store = tx.objectStore("characters");
        const get = store.get(id);
        get.onsuccess = () => store.put({ ...get.result, visualTags: "silver hair, violet eyes" });
        tx.oncomplete = () => resolve();
      });
      db.close();
    }, ARIA.id);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
    await editorStep(page, "Look");
    await expect(page.getByLabel("Locked look for pictures")).toHaveValue("silver hair, violet eyes");
    await page.getByRole("button", { name: /Generate reference sheet/ }).click();
    await expect(page.getByRole("button", { name: /Generate reference sheet/ })).toBeEnabled({ timeout: 20_000 });

    expect(prompts).toHaveLength(3);
    for (const prompt of prompts) expect(prompt).toContain("Character portrait. silver hair, violet eyes.");
    expect(prompts.map((p) => /front|three-quarter|side/i.exec(p)?.[0].toLowerCase())).toEqual(["front", "three-quarter", "side"]);
    await expect(page.getByRole("button", { name: /Make reference \d the main reference/ })).toHaveCount(2);
  });
});

test.describe("Settings", () => {
  test.use({ seed: { messages: 2 } });

  test("fal.ai has a key and model picker, and Wan a reference-model picker", async ({ page }) => {
    await page.goto("./#/settings/image");
    await page.getByRole("button", { name: "fal.ai (Seedream / FLUX Kontext)" }).click();
    // Switching provider moves the model to one fal has.
    await expect(page.getByRole("combobox", { name: "fal.ai model" })).toHaveText(/Seedream 4 \(up to 10 references\)/);
    await page.getByLabel("fal.ai API key").fill("my-fal-key");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("provider_api_key_fal"))).toBeTruthy();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("image_model"))).toBe("fal-ai/bytedance/seedream/v4/edit");

    await page.getByRole("combobox", { name: "fal.ai model" }).click();
    await page.getByRole("option", { name: "FLUX.1 Kontext pro (1 reference)" }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("image_model"))).toBe("fal-ai/flux-pro/kontext");

    await page.getByRole("button", { name: "Wan (Wanxiang, DashScope)" }).click();
    const referenceModel = page.getByRole("combobox", { name: "Wan model with reference photos" });
    await expect(referenceModel).toHaveText(/wan2\.7-image/);
    await referenceModel.click();
    await page.getByRole("option", { name: "wan2.5-i2i-preview" }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("wan_reference_model"))).toBe("wan2.5-i2i-preview");
  });
});
