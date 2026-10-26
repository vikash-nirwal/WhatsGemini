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
