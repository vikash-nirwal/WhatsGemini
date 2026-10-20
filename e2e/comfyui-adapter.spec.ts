import { test, expect } from "@playwright/test";
import { COMFY_URL, mockComfyUI, openSourceHarness, PNG_BASE64 } from "./comfyui";

// The ComfyUI adapter (#39) in a real browser against a page.route mock of
// ComfyUI's HTTP API: real fetch, FormData uploads, CORS and data: URL
// conversion, none of which jsdom does faithfully. It runs the adapter's own
// source, not the app, so it works before the adapter is registered.

const REFERENCE = { mimeType: "image/png", data: PNG_BASE64 };

const generate = (page: import("@playwright/test").Page, withReference: boolean, aspectRatio?: string) =>
  page.evaluate(
    async ({ withReference, reference, aspectRatio, serverUrl }) => {
      localStorage.setItem("comfyui_settings", JSON.stringify({ serverUrl, seed: "1234" }));
      const { createComfyUIAdapter } = await import("/src/features/ai/providers/comfyuiAdapter" as string);
      const adapter = createComfyUIAdapter({ pollIntervalMs: 50, timeoutMs: 10_000 });
      try {
        const result = await adapter.generateImage(
          { model: "", prompt: "Aria on a rooftop at dusk", referenceImages: withReference ? [reference] : undefined, aspectRatio },
          {}
        );
        return { images: result.images as string[] };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    { withReference, reference: REFERENCE, aspectRatio, serverUrl: COMFY_URL }
  );

test.describe("ComfyUI adapter against a mocked server", () => {
  test("uploads the reference, queues FaceID, polls history and returns the image as a data: URL", async ({ page }) => {
    const comfy = await mockComfyUI(page, { pendingPolls: 2 });
    await openSourceHarness(page);

    const result = await generate(page, true, "16:9");

    expect(result.error).toBeUndefined();
    expect(result.images).toEqual([`data:image/png;base64,${PNG_BASE64}`]);
    expect(comfy.sequence()).toEqual([
      "POST /upload/image",
      "POST /prompt",
      "GET /history/e2e-prompt-1",
      "GET /history/e2e-prompt-1",
      "GET /history/e2e-prompt-1",
      "GET /view",
    ]);
    const upload = comfy.requests[0];
    expect(upload.uploadName).toMatch(/^whatsgemini-ref-[0-9a-f]{8}-\w+\.png$/);
    const workflow = comfy.queuedWorkflow();
    expect(workflow["9"].inputs.image).toBe(upload.uploadName);
    expect(workflow["11"].class_type).toBe("IPAdapterFaceID");
    expect(workflow["3"].inputs.text).toBe("Aria on a rooftop at dusk");
    expect(workflow["5"].inputs).toMatchObject({ width: 1344, height: 768 });
    expect(workflow["6"].inputs.seed).toBe(1234);
    expect(comfy.requests[1].body.client_id).toEqual(expect.any(String));
  });

  test("uses plain text to image without a reference", async ({ page }) => {
    const comfy = await mockComfyUI(page);
    await openSourceHarness(page);

    const result = await generate(page, false);

    expect(result.images).toHaveLength(1);
    expect(comfy.sequence()[0]).toBe("POST /prompt");
    const classes = Object.values(comfy.queuedWorkflow()).map((n: any) => n.class_type);
    expect(classes).not.toContain("LoadImage");
  });

  test("blames CORS when ComfyUI runs without --enable-cors-header", async ({ page }) => {
    await mockComfyUI(page, { noCors: true });
    await openSourceHarness(page);

    const result = await generate(page, false);

    expect(result.error).toMatch(/blocked its reply \(CORS\).*--enable-cors-header/);
  });

  test("says ComfyUI can't be reached when nothing listens", async ({ page }) => {
    await page.route(`${COMFY_URL}/**`, (route) => route.abort("connectionrefused"));
    await openSourceHarness(page);

    const result = await generate(page, false);

    expect(result.error).toMatch(/Can't reach ComfyUI at http:\/\/127\.0\.0\.1:8188/);
  });
});
