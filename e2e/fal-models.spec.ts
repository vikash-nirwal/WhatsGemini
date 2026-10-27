import { test, expect, openRoute } from "./fixtures";

// fal.ai's model list (2026-10-27): browse every image model fal offers and
// pick one; it's set up from its own schema. fal's API is faked here.

test.use({ seed: { messages: 1 }, localStorageOverrides: { image_provider: "fal" } });

test("pick any fal.ai model from its list", async ({ page }) => {
  await page.route("https://api.fal.ai/v1/models**", async (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get("endpoint_id");
    if (id) {
      const props = id.endsWith("/edit") ? { prompt: {}, image_urls: { type: "array" }, aspect_ratio: {} } : { prompt: {}, image_size: {} };
      return route.fulfill({ json: { models: [{ endpoint_id: id, openapi: { components: { schemas: { ModelInput: { properties: props, required: ["prompt", ...(id.endsWith("/edit") ? ["image_urls"] : [])] } } } } }] } });
    }
    const category = url.searchParams.get("category");
    return route.fulfill({
      json: {
        has_more: false,
        models: category === "text-to-image"
          ? [{ endpoint_id: "fal-ai/nano-banana-pro", metadata: { display_name: "Nano Banana Pro", status: "active", description: "Google's image model." } }]
          : [{ endpoint_id: "fal-ai/nano-banana-pro/edit", metadata: { display_name: "Nano Banana Pro edit", status: "active", description: "Edits with references." } }],
      },
    });
  });
  await openRoute(page, "/settings/image");
  await page.getByRole("button", { name: "Browse all fal.ai models" }).click();
  const dialog = page.getByRole("dialog", { name: "fal.ai models" });
  await expect(dialog.getByRole("list", { name: "fal.ai models" })).toContainText("Nano Banana Pro edit");
  await dialog.getByRole("button", { name: "Uses reference photos" }).click();
  await expect(dialog.getByRole("list", { name: "fal.ai models" })).not.toContainText("Google's image model.");
  await dialog.getByRole("textbox", { name: "Search fal.ai models" }).fill("banana");
  await dialog.getByRole("button", { name: "Use Nano Banana Pro edit" }).click();
  await expect(page.getByRole("combobox", { name: "fal.ai model" })).toContainText("Nano Banana Pro edit");
  const setup = await page.evaluate(() => JSON.parse(localStorage.getItem("fal_custom_models") || "{}")["fal-ai/nano-banana-pro/edit"]);
  expect(setup).toMatchObject({ referenceField: "image_urls", textEndpoint: "fal-ai/nano-banana-pro", textSize: "image_size", referenceSize: "aspect_ratio" });
});
