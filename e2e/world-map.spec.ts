import { test, expect, openChat, openRoute, headerAction } from "./fixtures";

// World map (#66): a World's map with pinned places; a chat set in that
// world shows where the scene is.

test.use({ seed: { messages: 4 } });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

test("a map is uploaded, places pinned, and the chat shows where the scene is", async ({ page }) => {
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Eldoria");
  await page.locator("#world-premise").fill("A floating archipelago where storms carry magic.");
  await page.getByTestId("world-map-input").setInputFiles({ name: "map.png", mimeType: "image/png", buffer: PNG });
  const map = page.getByRole("button", { name: "World map: click to add a place" });
  await expect(map).toBeVisible();
  await map.click({ position: { x: 40, y: 20 } });
  await page.getByLabel("Place name").fill("Saltmere");
  await page.getByRole("button", { name: "Create World" }).click();
  await expect(page).toHaveURL(/#\/worlds$/);

  await openChat(page);
  await headerAction(page, "Scene & story");
  await page.getByRole("combobox", { name: "World for this chat" }).click();
  await page.getByRole("option", { name: "Eldoria" }).click();
  await page.getByRole("switch", { name: "Track the scene" }).click();
  await page.getByLabel("location", { exact: true }).fill("the docks at Saltmere");
  await expect(page.getByRole("img", { name: "World map, you are at Saltmere" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Saltmere (you are here)" })).toBeVisible();
});
