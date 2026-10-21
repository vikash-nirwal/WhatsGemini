import fs from "fs";
import path from "path";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, openRoute } from "./fixtures";
import { COMFY_URL, mockComfyUI } from "./comfyui";

// ComfyUI settings (#39) inside the app, against a page.route mock of the
// server. The settings rows only appear once "comfyui" is registered as an
// image provider and ImageGenerationSettings renders <ComfyUISettings />,
// which happens when the ComfyUI lane is merged. Until registry.ts lists the
// adapter, these tests are skipped rather than failing.
const INTEGRATED = fs
  .readFileSync(path.join(__dirname, "..", "src/features/ai/providers/registry.ts"), "utf8")
  .includes("comfyuiAdapter");

const IPADAPTER_NODES = {
  IPAdapterUnifiedLoaderFaceID: { input: { required: {} } },
  IPAdapterFaceID: { input: { required: {} } },
  CheckpointLoaderSimple: { input: { required: { ckpt_name: [["juggernautXL_v9.safetensors"]] } } },
  LoraLoader: { input: { required: { lora_name: [["aria_v1.safetensors"]] } } },
};

const SIMPLE_WORKFLOW = {
  "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "mine.safetensors" } },
  "6": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["4", 1] } },
  "3": { class_type: "KSampler", inputs: { seed: 1, positive: ["6", 0], model: ["4", 0] } },
};

test.describe("ComfyUI settings", () => {
  test.skip(!INTEGRATED, "ComfyUI isn't registered in registry.ts yet; runs once the ComfyUI lane is merged.");

  test.beforeEach(async ({ page }) => {
    await openRoute(page, "/settings/image");
    await page.getByRole("button", { name: "ComfyUI (local)" }).click();
    await expect(page.getByRole("textbox", { name: "ComfyUI server URL" })).toHaveValue(COMFY_URL);
  });

  test("tests the connection and offers the installed models", async ({ page }) => {
    const comfy = await mockComfyUI(page, { knownNodes: IPADAPTER_NODES });

    await page.getByRole("button", { name: "Test connection" }).click();

    await expect(page.getByTestId("comfyui-connection-status")).toHaveText(/Connected to ComfyUI 0\.3\.60, cuda:0 NVIDIA GeForce RTX 3060 \(12 GB\)\.$/);
    expect(comfy.sequence()).toContain("GET /system_stats");
    await expect(page.getByTestId("comfyui-ckpt-sdxl-faceid").locator("option")).toHaveAttribute("value", "juggernautXL_v9.safetensors");
  });

  test("explains CORS when ComfyUI runs without --enable-cors-header", async ({ page }) => {
    await mockComfyUI(page, { noCors: true });

    await page.getByRole("button", { name: "Test connection" }).click();

    await expect(page.getByTestId("comfyui-connection-status")).toHaveText(/CORS.*--enable-cors-header/);
  });

  test("generates a test picture", async ({ page }) => {
    const comfy = await mockComfyUI(page);

    await page.getByRole("button", { name: "Generate a test picture" }).click();

    await expect(page.getByRole("img", { name: "ComfyUI test result" })).toBeVisible();
    expect(comfy.sequence()).toEqual(["POST /prompt", "GET /history/e2e-prompt-1", "GET /history/e2e-prompt-1", "GET /view"]);
  });

  test("shows how picture prompts are worded, following the checkpoint", async ({ page }) => {
    const style = page.getByTestId("prompt-style");
    await expect(style).toContainText('Without a photo: SDXL phrases, for ComfyUI running the "SDXL text to image" workflow');
    await expect(style).toContainText("With a reference photo: SDXL phrases");
    await page.getByRole("combobox", { name: "Checkpoint for SDXL text to image" }).fill("ponyDiffusionV6XL.safetensors");
    await expect(style).toContainText("Without a photo: Pony score tags");
  });

  test("keeps its choices after a reload", async ({ page }) => {
    await page.getByRole("textbox", { name: "ComfyUI seed" }).fill("777");
    await page.reload();
    await page.getByRole("button", { name: "ComfyUI (local)" }).click();
    await expect(page.getByRole("textbox", { name: "ComfyUI seed" })).toHaveValue("777");
  });

  // Only this component's rows (a11y.spec.ts scans the whole page), with
  // the connection status and an imported workflow's mapping editor showing.
  test("has no accessibility violations", async ({ page }) => {
    await mockComfyUI(page, { knownNodes: IPADAPTER_NODES });
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByTestId("comfyui-connection-status")).toHaveText(/Connected/);
    await page.getByRole("textbox", { name: "Workflow JSON" }).fill(JSON.stringify(SIMPLE_WORKFLOW));
    await page.getByRole("button", { name: "Import pasted JSON" }).click();
    await expect(page.getByTestId("comfyui-mapping-editor")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include(".comfyui-settings-row")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
