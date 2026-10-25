import type { Page } from "@playwright/test";
import { test, expect, openChat, headerAction, ARIA } from "./fixtures";

// Chat backdrops (#13): uploaded or generated from where the story is set,
// shown faintly behind the bubbles.

test.use({ seed: { messages: 4 } });

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

const patch = (page: Page, store: "characters" | "chats", id: number, fields: Record<string, unknown>) =>
  page.evaluate(
    async ({ store, id, fields }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction(store, "readwrite");
        const s = tx.objectStore(store);
        const get = s.get(id);
        get.onsuccess = () => s.put({ ...get.result, ...fields });
        tx.oncomplete = () => resolve();
      });
      db.close();
    },
    { store, id, fields }
  );

test("an uploaded backdrop shows behind the chat, and can be removed", async ({ page }) => {
  await openChat(page);
  await headerAction(page, "Scene & story");
  await page.getByTestId("backdrop-input").setInputFiles({ name: "bg.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
  await expect(page.locator('[data-slot="chat-backdrop"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator('[data-slot="chat-backdrop"]')).toHaveCount(0);
});

test.describe("generated", () => {
  test.use({ localStorageOverrides: { image_provider: "openai", image_model: "gpt-image-1-mini", provider_api_key_openai: "sk-test" } });

  test("a backdrop is generated from the scenario and setting tags", async ({ page }) => {
    let prompt = "";
    await page.route("https://api.openai.com/v1/images/**", (route) => {
      prompt = route.request().postDataJSON()?.prompt || "";
      return route.fulfill({ json: { data: [{ b64_json: PNG }] } });
    });
    await openChat(page);
    await patch(page, "characters", ARIA.id, { scenario: "A rainy night in a small seaside town." });
    await patch(page, "chats", 1, { worldTags: ["noir"] });
    await page.reload();
    await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

    await headerAction(page, "Scene & story");
    await page.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(page.locator('[data-slot="chat-backdrop"]')).toHaveCount(1, { timeout: 15_000 });
    expect(prompt).toContain("Wide atmospheric background scene: A rainy night in a small seaside town.; mood: noir.");
    expect(prompt).toContain("No people");
  });
});

test("without a setting, it says what to add first", async ({ page }) => {
  await openChat(page);
  await headerAction(page, "Scene & story");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Add a scenario, a world or setting tags first");
});
