/// <reference lib="webworker" />

// Precaches the app shell (HTML/JS/CSS, injected by react-scripts' built-in
// WorkboxWebpackPlugin.InjectManifest at build time) so the app keeps loading
// offline. This is a HashRouter app, so every route is the same index.html -
// there's no server-side path to fall back on, and none is needed.

import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { SYNC_TAG, wakeNotices } from "./features/life/backgroundSync";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

// Google Fonts stylesheet: revalidate in the background, serve cached instantly.
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({ cacheName: "google-fonts-stylesheets" })
);

// Google Fonts font files: immutable/versioned, safe to cache-first for a long time.
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365, maxEntries: 30 })],
  })
);

// manifest.json and the app icons are only referenced from index.html's <link>/<meta>
// tags, not from webpack's module graph, so InjectManifest never precaches them on
// its own. Cache them the first time they're fetched so they're available offline too.
// Matched by filename rather than request.destination, since that field isn't set
// consistently across every initiator (favicon link, manifest icon lookup, etc.).
registerRoute(
  ({ url }) =>
    url.origin === self.location.origin &&
    /\/(manifest\.json|favicon.*\.(?:ico|png)|logo\d+\.png|apple-touch-icon\.png)$/.test(url.pathname),
  new CacheFirst({ cacheName: "app-icons-and-manifest" })
);

// Everything else (in particular the Gemini API) is left untouched - only
// requests matched by a registered route above are intercepted at all.

// Lets the app (via ServiceWorkerUpdater) force an already-downloaded, waiting
// worker to activate immediately instead of waiting for every tab to close.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Clicking a chat notification (#43, shown by the app through
// registration.showNotification) focuses an open window of the app and asks
// it to open that chat, or opens a new window on the chat when none is
// open. The page does the routing (HashRouter), so the worker only passes
// the chat id along.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const chatId = event.notification.data?.chatId;
  // World happenings (#194) carry a page to open instead of a chat.
  const path = event.notification.data?.path;
  if (typeof path === "string") {
    event.waitUntil(
      (async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const client = windows.find((c) => c.url.startsWith(self.registration.scope)) || windows[0];
        if (client) {
          await client.focus();
          client.postMessage({ type: "OPEN_PATH", path });
          return;
        }
        await self.clients.openWindow(`${self.registration.scope}#${path}`);
      })()
    );
    return;
  }
  if (typeof chatId !== "number") return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = windows.find((c) => c.url.startsWith(self.registration.scope)) || windows[0];
      if (client) {
        await client.focus();
        client.postMessage({ type: "OPEN_CHAT", chatId });
        return;
      }
      await self.clients.openWindow(`${self.registration.scope}#/chat/${chatId}`);
    })()
  );
});

// Android background sync (#201): when the browser wakes the installed app,
// read the saved chats straight from IndexedDB (the app isn't running) and
// show what's true: tomorrow's plans, and a nudge after a quiet day. What
// was shown is noted in the same database so it isn't shown twice.
const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open("ChatAppDB");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const readAll = <T,>(db: IDBDatabase, store: string): Promise<T[]> =>
  new Promise((resolve) => {
    const get = db.transaction(store).objectStore(store).getAll();
    get.onsuccess = () => resolve(get.result as T[]);
    get.onerror = () => resolve([]);
  });
const readSetting = <T,>(db: IDBDatabase, key: string): Promise<T | undefined> =>
  new Promise((resolve) => {
    const get = db.transaction("settings").objectStore("settings").get(key);
    get.onsuccess = () => resolve(get.result?.value as T | undefined);
    get.onerror = () => resolve(undefined);
  });
const writeSetting = (db: IDBDatabase, key: string, value: unknown): Promise<void> =>
  new Promise((resolve) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });

const wakeUp = async () => {
  const db = await openDb();
  try {
    const now = Date.now();
    const reminded = (await readSetting<number[]>(db, "sw_plans_reminded")) || [];
    const nudgedAt = (await readSetting<number>(db, "sw_nudged_at")) || 0;
    const notices = wakeNotices(await readAll(db, "chats"), now, reminded, nudgedAt);
    for (const n of notices) {
      await self.registration.showNotification(n.title, { body: n.body, tag: n.tag, icon: "logo192.png", data: { path: n.path } });
      if (n.tag.startsWith("plan-")) reminded.push(Number(n.tag.slice(5)));
      else await writeSetting(db, "sw_nudged_at", now);
    }
    await writeSetting(db, "sw_plans_reminded", reminded.slice(-50));
  } finally {
    db.close();
  }
};

self.addEventListener("periodicsync", ((event: Event & { tag: string; waitUntil: (p: Promise<unknown>) => void }) => {
  if (event.tag === SYNC_TAG) event.waitUntil(wakeUp().catch(() => undefined));
}) as EventListener);
