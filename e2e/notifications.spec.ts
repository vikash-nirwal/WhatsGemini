import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, sendMessage, waitForReplyDone, chatMessages } from "./fixtures";

// Notifications (#43): with the switch on and the permission granted through
// the browser context, a reply that lands while the tab is hidden, or an
// auto follow-up, asks for a notification, and clicking it opens the chat.
// The dev server has no service worker, so this covers the page's
// `new Notification` path; showNotification is covered by the unit tests.
//
// The iphone project can't show notifications at all: like Safari on a real
// iPhone outside a Home Screen app, Playwright's mobile WebKit has no
// Notification API. There it checks that Settings says how to get them.

test.use({ seed: { messages: 1 }, permissions: ["notifications"] });

interface Shown {
  title: string;
  body: string | null;
  tag: string | null;
}

// Fakes the tab's visibility (read from localStorage, so it survives a
// reload) and records every notification the page creates, while still
// creating the real one.
//
// The permission still comes from the context's grant, but read through the
// Permissions API: Playwright's headless Chromium shell keeps reporting
// Notification.permission as "denied" and its WebKit as "default" after a
// grant, while navigator.permissions.query reports "granted" in all of them.
const installFakes = (page: Page) =>
  page.addInitScript(() => {
    const isHidden = () => {
      try {
        return localStorage.getItem("__e2e_hidden") === "true";
      } catch {
        return false;
      }
    };
    Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => (isHidden() ? "hidden" : "visible") });
    Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: isHidden });

    const Real = window.Notification;
    if (!Real) return;
    let permission: NotificationPermission = "default";
    navigator.permissions.query({ name: "notifications" as PermissionName }).then((status) => {
      permission = status.state === "prompt" ? "default" : status.state;
    });
    const shown: { title: string; body: string | null; tag: string | null; instance: Notification }[] = [];
    (window as any).__notifications = shown;
    class Recorded extends Real {
      static get permission() {
        return permission;
      }
      static async requestPermission() {
        return permission;
      }
      constructor(title: string, options?: NotificationOptions) {
        super(title, options);
        shown.push({ title, body: options?.body ?? null, tag: options?.tag ?? null, instance: this });
      }
    }
    (window as any).Notification = Recorded;
  });

const shownNotifications = (page: Page): Promise<Shown[]> =>
  page.evaluate(() => ((window as any).__notifications || []).map(({ title, body, tag }: Shown) => ({ title, body, tag })));

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    localStorage.setItem("__e2e_hidden", String(h));
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

const turnOnInSettings = async (page: Page) => {
  await openRoute(page, "/settings/chat");
  const toggle = page.getByRole("switch", { name: "Notify me of new messages" });
  await expect(toggle).not.toBeChecked({ timeout: 30_000 });
  await toggle.click();
  await expect(toggle).toBeChecked();
};

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "iphone" && !testInfo.title.startsWith("iPhone:"), "mobile WebKit has no Notification API, like iOS Safari in a tab");
  test.skip(testInfo.project.name !== "iphone" && testInfo.title.startsWith("iPhone:"), "only the iphone project lacks the Notification API");
  await installFakes(page);
});

test("iPhone: Settings explains that notifications need the Home Screen app", async ({ page }) => {
  await openRoute(page, "/settings/chat");
  await expect(page.getByRole("switch", { name: "Notify me of new messages" })).toBeDisabled({ timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "add WhatsGemini to your Home Screen" })).toBeVisible();
});

test("a reply that lands in a hidden tab notifies, and the click opens the chat", async ({ page, mockAI }) => {
  mockAI.reply("I missed you! Where did you go?");
  await turnOnInSettings(page);
  await openChat(page);
  expect(await page.evaluate(() => Notification.permission)).toBe("granted");

  await setHidden(page, true);
  await sendMessage(page, "Back in a sec");
  await expect.poll(() => shownNotifications(page)).toEqual([
    { title: "Aria", body: "I missed you! Where did you go?", tag: "chat-1" },
  ]);
  await waitForReplyDone(page);

  // Go elsewhere in the app, then click the notification.
  await setHidden(page, false);
  await page.evaluate(() => {
    window.location.hash = "#/settings/chat";
  });
  await expect(page.getByRole("switch", { name: "Notify me of new messages" })).toBeVisible();
  await page.evaluate(() => (window as any).__notifications[0].instance.onclick());
  await expect(page).toHaveURL(/#\/chat\/1$/);
  await expect(page.getByLabel("Message input")).toBeVisible();
});

test("a reply in a visible tab doesn't notify", async ({ page, mockAI }) => {
  mockAI.reply("Right here with you.");
  await turnOnInSettings(page);
  await openChat(page);
  await sendMessage(page, "Hello");
  await expect(chatMessages(page).getByText("Right here with you.")).toBeVisible();
  await waitForReplyDone(page);
  expect(await shownNotifications(page)).toEqual([]);
});

test("nothing is shown while the switch is off", async ({ page, mockAI }) => {
  mockAI.reply("Quiet reply.");
  await openChat(page);
  await setHidden(page, true);
  await sendMessage(page, "Hello");
  await expect.poll(() => mockAI.requests.length).toBe(1);
  await waitForReplyDone(page);
  expect(await shownNotifications(page)).toEqual([]);
});

test("an auto follow-up in a hidden tab notifies", async ({ page, mockAI }) => {
  mockAI.reply("Hey, still there?");
  await turnOnInSettings(page);
  await openChat(page);
  // A follow-up due straight away: the seeded chat ends on Aria's message,
  // sent long ago.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("chats", "readwrite");
      const store = tx.objectStore("chats");
      const get = store.get(1);
      get.onsuccess = () =>
        store.put({ ...get.result, autoReply: { enabled: true, minDelaySeconds: 1, maxDelaySeconds: 1, maxFollowups: 1, followupCount: 0 } });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem("__e2e_hidden", "true");
  });
  await page.reload();

  await expect.poll(() => shownNotifications(page), { timeout: 15_000 }).toEqual([
    { title: "Aria", body: "Hey, still there?", tag: "chat-1" },
  ]);
  await expect(chatMessages(page).getByText("Hey, still there?")).toBeVisible();
});
