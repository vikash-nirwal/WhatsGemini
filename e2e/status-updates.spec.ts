import type { Page } from "@playwright/test";
import { test, expect, openChat, ARIA } from "./fixtures";

// Status updates (#8): a character with statuses on posts one now and then;
// the sidebar shows it with a ring until seen, and replying quotes it.

test.use({ seed: { messages: 4 } });

const patchAria = (page: Page, fields: Record<string, unknown>) =>
  page.evaluate(
    async ({ id, fields }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("characters", "readwrite");
        const store = tx.objectStore("characters");
        const get = store.get(id);
        get.onsuccess = () => store.put({ ...get.result, ...fields });
        tx.oncomplete = () => resolve();
      });
      db.close();
    },
    { id: ARIA.id, fields }
  );

// Photo statuses (#118): a status with a picture shows it in the viewer.
test("a status with a photo shows the picture", async ({ page }) => {
  await openChat(page);
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await patchAria(page, { statuses: [{ id: "st-photo", text: "Golden hour at the docks", image: pixel, createdAt: Date.now() - 60_000 }] });
  await page.goto("./#/updates");
  await page.reload();
  await page.getByRole("region", { name: "Recent updates" }).getByRole("button", { name: "Aria's status, new" }).click({ timeout: 30_000 });
  const viewer = page.getByRole("dialog", { name: "Aria's status" });
  await expect(viewer.getByRole("img", { name: "Aria's status photo" })).toBeVisible();
  await expect(viewer).toContainText("Golden hour at the docks");
});

test.describe("on wide screens", () => {
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the sidebar is always shown on wide screens; phones open it from the menu");

test("a character with statuses on posts one, shown in the sidebar", async ({ page, mockAI }) => {
  await page.clock.install();
  mockAI.reply("Long shift, but the rain made the cafe cozy ☔");
  await openChat(page);
  await patchAria(page, { postsStatuses: true });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await page.clock.fastForward(20_000);

  await expect(page.getByRole("button", { name: "Aria's status, new" })).toBeVisible({ timeout: 15_000 });
  expect(mockAI.requests[0].prompt).toContain("Write one short status update that Aria posts");
});

test("a status is seen once opened, and replying quotes it in the chat", async ({ page }) => {
  await openChat(page);
  await patchAria(page, { statuses: [{ id: "s1", text: "Pottery class tonight!", createdAt: Date.now() - 60_000 }] });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Aria's status, new" }).click();
  const viewer = page.getByRole("dialog", { name: "Aria's status" });
  await expect(viewer).toContainText("Pottery class tonight!");
  await viewer.getByRole("button", { name: "Reply" }).click();
  await expect(viewer).toBeHidden();
  await expect(page.getByLabel("Message input")).toHaveValue('(Replying to your status: "Pottery class tonight!") ');
  await expect(page.getByRole("button", { name: "Aria's status", exact: true })).toBeVisible();
});

test("the collapsed sidebar still shows who posted", async ({ page }) => {
  await openChat(page);
  await patchAria(page, { statuses: [{ id: "s1", text: "Pottery class tonight!", createdAt: Date.now() - 60_000 }] });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Aria's status, new" }).click();
  await expect(page.getByRole("dialog", { name: "Aria's status" })).toContainText("Pottery class tonight!");
});
});

test.describe("on phones and tablets", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, "wide screens are covered above");

  test("the status row is in the menu, and replying closes it and quotes the status", async ({ page }) => {
    await openChat(page);
    await patchAria(page, { statuses: [{ id: "s1", text: "Pottery class tonight!", createdAt: Date.now() - 60_000 }] });
    await page.reload();
    await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("button", { name: "Aria's status, new" }).click();
    const viewer = page.getByRole("dialog", { name: "Aria's status" });
    await viewer.getByRole("button", { name: "Reply" }).click();
    await expect(viewer).toBeHidden();
    await expect(page.getByLabel("Message input")).toHaveValue('(Replying to your status: "Pottery class tonight!") ');
  });
});
