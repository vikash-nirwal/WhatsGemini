import type { Page } from "@playwright/test";
import { test, expect, openChat, ARIA, sendMessage, messageBubble } from "./fixtures";

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

// Status mentions (#129): a status that tags you says so and shows the @.
test("a status that mentions you stands out", async ({ page }) => {
  await openChat(page);
  await patchAria(page, { statuses: [{ id: "st-m", text: "Garage karaoke with @Sam tonight 🎤", mentionsYou: true, createdAt: Date.now() - 60_000 }] });
  await page.goto("./#/updates");
  await page.reload();
  const row = page.getByRole("region", { name: "Recent updates" }).getByRole("button", { name: "Aria's status, new" });
  await expect(row).toContainText("Mentioned you", { timeout: 30_000 });
  await row.click();
  await expect(page.getByRole("dialog", { name: "Aria's status" }).locator('[data-slot="mention"]')).toHaveText("@Sam");
});

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

// Statuses live in Updates (#150: the sidebar's status row is gone), on
// every screen size.
test.describe("in Updates", () => {

test("a character with statuses on posts one, shown in Updates", async ({ page, mockAI }) => {
  await page.clock.install();
  mockAI.reply("Long shift, but the rain made the cafe cozy ☔");
  await openChat(page);
  await patchAria(page, { postsStatuses: true });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await page.clock.fastForward(20_000);

  await expect.poll(() => mockAI.requests.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.goto("./#/updates");
  await expect(page.getByRole("region", { name: "Recent updates" }).getByRole("button", { name: "Aria's status, new" })).toBeVisible({ timeout: 15_000 });
  expect(mockAI.requests[0].prompt).toContain("Write one short status update that Aria posts");
});

test("a status is seen once opened, and replying quotes it in the chat", async ({ page, mockAI }) => {
  await openChat(page);
  await patchAria(page, { statuses: [{ id: "s1", text: "Pottery class tonight!", createdAt: Date.now() - 60_000 }] });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await page.goto("./#/updates");
  await page.getByRole("region", { name: "Recent updates" }).getByRole("button", { name: "Aria's status, new" }).click({ timeout: 30_000 });
  const viewer = page.getByRole("dialog", { name: "Aria's status" });
  await expect(viewer).toContainText("Pottery class tonight!");
  await viewer.getByRole("button", { name: "Reply" }).click();
  await expect(viewer).toBeHidden();
  // The status is quoted above the composer (#129), and on the sent message.
  await expect(page.getByRole("group", { name: "Replying to Aria · Status" })).toContainText("Pottery class tonight!");
  await expect(page.getByLabel("Message input")).toHaveValue("");
  await sendMessage(page, "So jealous!");
  await expect(messageBubble(page, "So jealous!").locator('[data-slot="quoted-status"]')).toContainText("Pottery class tonight!");
  await expect.poll(() => mockAI.requests.filter((r) => r.stream).length).toBe(1);
  expect(mockAI.requests.filter((r) => r.stream)[0].prompt).toContain('(replying to your status: "Pottery class tonight!") So jealous!');
  // Opened, so it's under Viewed now.
  await page.goto("./#/updates");
  await expect(page.getByRole("region", { name: "Viewed updates" }).getByRole("button", { name: "Aria's status", exact: true })).toBeVisible({ timeout: 30_000 });
});
});
