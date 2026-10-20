import { Page, Request } from "@playwright/test";
import { test, expect, openChat, sendMessage, waitForReplyDone, ARIA } from "./fixtures";

// #36-#38: a character's appearance photo reaches each image provider as a
// reference. The provider's HTTP endpoints are mocked with page.route, so
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

// Gives Aria an appearance photo. Runs on the app's origin, after the
// fixture has created and seeded the database.
const addAppearanceImage = async (page: Page) => {
  await page.goto("./");
  await page.evaluate(
    async ({ id, image }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("characters", "readwrite");
        const store = tx.objectStore("characters");
        const get = store.get(id);
        get.onsuccess = () => store.put({ ...get.result, appearanceImages: [image] });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id: ARIA.id, image: `data:image/png;base64,${REFERENCE_PNG}` }
  );
};

const requestPictureFromAria = async (page: Page) => {
  await addAppearanceImage(page);
  await openChat(page);
  await sendMessage(page, "/image a selfie please");
  // Wan polls every 5 seconds, so its picture takes a little longer.
  await expect(page.getByText("Here's me right now!")).toBeVisible({ timeout: 20_000 });
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
    expect(body.prompt).toContain("Aria waving at the camera");
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
    expect(text).toContain('name="image[]"; filename="reference-1.');
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
    expect(content[0].text).toContain("Aria waving at the camera");
    // The app labels every reference image/jpeg; the bytes are the PNG as stored.
    expect(content.slice(1)).toEqual([{ image: `data:image/jpeg;base64,${REFERENCE_PNG}` }]);
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
