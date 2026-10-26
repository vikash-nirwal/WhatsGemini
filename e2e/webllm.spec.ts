import { test, expect, openChat, openRoute, sendMessage } from "./fixtures";

// The free in-browser model (#55). Test browsers have no usable GPU, so what's
// checked is the setup and the message where it can't run - and that
// nothing is downloaded then.

test.use({ seed: { messages: 2 } });

test("it can be picked in Settings, which says whether this browser can run it", async ({ page }) => {
  await openRoute(page, "/settings/text");
  await page.getByRole("button", { name: "In this browser (free, WebLLM)" }).click();
  await expect(page.getByText("The first reply downloads the model")).toBeVisible();
  await expect(page.getByText(/can't use the GPU|has WebGPU/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("chat_provider"))).toBe("webllm");
});

test.describe("chatting without a usable GPU", () => {
  test.use({ localStorageOverrides: { chat_provider: "webllm", ai_model: "Llama-3.2-1B-Instruct-q4f16_1-MLC" } });

  test("explains that it can't run here, and downloads nothing", async ({ page }) => {
    const downloads: string[] = [];
    page.on("request", (r) => {
      if (/huggingface|mlc-ai|\.wasm/.test(r.url())) downloads.push(r.url());
    });
    // Headless Chromium may expose WebGPU with no adapter; take it away so
    // every browser behaves the same.
    await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }));
    await openChat(page);
    await sendMessage(page, "Hello?");
    await expect(page.getByText(/needs WebGPU/)).toBeVisible({ timeout: 15_000 });
    expect(downloads).toEqual([]);
  });
});

// #199: background life on the in-browser model; without a usable GPU the
// setting says so and stays off.
test("background life on this device needs a usable GPU", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }));
  await openRoute(page, "/settings/spending");
  const pick = page.getByRole("combobox", { name: "Background life on this device" });
  await expect(pick).toContainText("Off (use my model)", { timeout: 30_000 });
  await pick.click();
  await page.getByRole("option", { name: "Llama-3.2-1B-Instruct" }).click();
  await expect(page.getByText("This browser can't use the GPU for a model")).toBeVisible();
  await expect(pick).toContainText("Off (use my model)");
  expect(await page.evaluate(() => localStorage.getItem("background_on_device"))).toBeNull();
});
