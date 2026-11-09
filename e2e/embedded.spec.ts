import { test, expect, Page, FrameLocator } from "@playwright/test";
import { createServer, Server } from "http";
import { existsSync, readFileSync, statSync } from "fs";
import { extname, join, normalize, resolve } from "path";
import { ARIA, BASE_LOCAL_STORAGE } from "./fixtures";

// The embedded build and the host bridge (#263, #264), end to end: a stand-in
// host page on one origin iframes the embedded build, served on another, and
// talks to it with protocol v1. It needs `npm run build:embedded` first (the
// bridge only exists in that build), so it skips when build/ holds anything
// else, and runs on the desktop project only. No AI is called: the one
// picture is a gradient test pattern drawn in the page.

const BUILD = resolve(__dirname, "..", "build");
const EMBEDDED_JSON = join(BUILD, "embedded.json");
const hasEmbeddedBuild = existsSync(EMBEDDED_JSON);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
};

const listen = (server: Server) =>
  new Promise<number>((done) => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));

let kindred: Server;
let host: Server;
let kindredOrigin = "";
let hostOrigin = "";

test.beforeAll(async () => {
  if (!hasEmbeddedBuild) return;
  kindred = createServer((req, res) => {
    const path = decodeURIComponent((req.url || "/").split(/[?#]/)[0]);
    let file = normalize(join(BUILD, path === "/" ? "index.html" : path));
    if (!file.startsWith(BUILD) || !existsSync(file) || statSync(file).isDirectory()) file = join(BUILD, "index.html");
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  // Kindred on 127.0.0.1 and the host on localhost: two different origins.
  kindredOrigin = `http://127.0.0.1:${await listen(kindred)}`;
  host = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><body style="margin:0">
<iframe id="kindred" title="Kindred" src="${kindredOrigin}/?host=${encodeURIComponent(hostOrigin)}" style="width:1200px;height:760px;border:0"></iframe>
<script>
  window.__messages = [];
  const frame = document.getElementById("kindred");
  window.addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow || e.origin !== ${JSON.stringify(kindredOrigin)}) return;
    window.__messages.push(e.data);
    if (e.data && e.data.type === "saveImage") frame.contentWindow.postMessage({ rd: 1, type: "saved", ok: true }, ${JSON.stringify(kindredOrigin)});
  });
  window.__send = (m) => frame.contentWindow.postMessage(m, ${JSON.stringify(kindredOrigin)});
</script></body></html>`);
  });
  const hostPort = await new Promise<number>((done) => host.listen(0, "localhost", () => done((host.address() as { port: number }).port)));
  hostOrigin = `http://localhost:${hostPort}`;
});

test.afterAll(async () => {
  kindred?.close();
  host?.close();
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!hasEmbeddedBuild, "needs `npm run build:embedded` first");
  test.skip(testInfo.project.name !== "desktop", "one browser is enough for the bridge");
  // Past the 18+ gate and onto Ollama (no key, no login) in Kindred's frame.
  await page.addInitScript((entries) => {
    try {
      if (sessionStorage.getItem("__e2e_init")) return;
      sessionStorage.setItem("__e2e_init", "1");
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    } catch {
      // A frame without storage.
    }
  }, BASE_LOCAL_STORAGE);
  aiReply = "A calm reply.";
  await page.route("**/chat/completions", (route) => {
    const stream = Boolean(route.request().postDataJSON()?.stream);
    return stream
      ? route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ choices: [{ delta: { content: aiReply } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n` })
      : route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content: aiReply } }] }) });
  });
});

// What the stand-in AI answers, set per test.
let aiReply = "";

const messages = (page: Page) => page.evaluate(() => (window as any).__messages as any[]);
const send = (page: Page, message: unknown) => page.evaluate((m) => (window as any).__send(m), message);

const openHost = async (page: Page): Promise<FrameLocator> => {
  await page.goto(`${hostOrigin}/`);
  const frame = page.frameLocator("#kindred");
  await expect(frame.getByRole("heading", { name: "Welcome to Kindred" })).toBeVisible({ timeout: 30_000 });
  return frame;
};

test("says ready with the build's version, and the screen's title", async ({ page }) => {
  await openHost(page);
  const info = JSON.parse(readFileSync(EMBEDDED_JSON, "utf8"));
  await expect.poll(() => messages(page)).toContainEqual({ rd: 1, type: "ready", version: info.version, commit: info.commit, bridge: 1 });
  await expect.poll(() => messages(page)).toContainEqual({ rd: 1, type: "title", text: "Kindred" });
});

test("panic covers the app until unpanic; unknown messages change nothing", async ({ page }) => {
  const frame = await openHost(page);
  const cover = frame.locator('[data-slot="host-cover"]');
  await send(page, { rd: 1, type: "launch", anything: true });
  await send(page, { rd: 2, type: "panic" });
  await expect(frame.getByRole("heading", { name: "Welcome to Kindred" })).toBeVisible();
  await expect(cover).toHaveCount(0);

  await send(page, { rd: 1, type: "panic" });
  await expect(cover).toBeVisible();
  await send(page, { rd: 1, type: "unpanic" });
  await expect(cover).toHaveCount(0);
  await send(page, { rd: 1, type: "lock" });
  await expect(cover).toBeVisible();
  await send(page, { rd: 1, type: "unpanic" });
  await expect(frame.getByRole("heading", { name: "Welcome to Kindred" })).toBeVisible();
});

test("open with a story lands on the new story page with it pasted", async ({ page }) => {
  const frame = await openHost(page);
  const text = "The keeper climbed the lighthouse stairs at dusk and lit the lamp for the boats coming home.";
  await send(page, { rd: 1, type: "open", adaptStory: { title: "The Lighthouse Keeper", author: "A. Writer", text } });
  await expect(frame.getByLabel("Story to play")).toHaveValue(text);
  // The title shows once the story is read, which the user does as usual.
  aiReply = JSON.stringify({ premise: "A keeper lights the lamp for the boats.", cast: [{ name: "The keeper", about: "Keeps the light." }], beats: [{ beat: "The climb", events: "The keeper climbs the stairs." }, { beat: "The lamp", events: "The lamp is lit." }, { beat: "Home", events: "The boats come home." }] });
  await frame.getByRole("button", { name: "Read the story" }).click();
  await expect(frame.getByPlaceholder("Name this story")).toHaveValue("The Lighthouse Keeper");
  await expect.poll(() => messages(page)).toContainEqual({ rd: 1, type: "title", text: "New story" });
});

test("Save to library sends a generated picture as PNG and shows the host's answer", async ({ page }) => {
  const frame = await openHost(page);
  const kindredFrame = page.frame({ url: (url) => url.origin === kindredOrigin })!;
  // A chat with Aria whose last reply carries a JPEG test pattern, so the
  // conversion to PNG runs too.
  await kindredFrame.evaluate(async (character) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 64, 48);
    g.addColorStop(0, "#1e90ff");
    g.addColorStop(1, "#ffd700");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 48);
    const jpeg = canvas.toDataURL("image/jpeg", 0.9);
    const db: IDBDatabase = await new Promise((done, fail) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => done(req.result);
      req.onerror = () => fail(req.error);
    });
    await new Promise<void>((done, fail) => {
      const tx = db.transaction(["characters", "chats"], "readwrite");
      tx.objectStore("characters").put(character);
      tx.objectStore("chats").put({
        id: 1,
        title: character.name,
        timestamp: Date.UTC(2026, 0, 15, 12, 5),
        characterIds: [character.id],
        content: [
          { id: "m1", timestamp: Date.UTC(2026, 0, 15, 12, 0), role: "you", txt: "Show me the harbour." },
          { id: "m2", timestamp: Date.UTC(2026, 0, 15, 12, 1), role: "ai", txt: "Here it is.", speakerId: character.id, images: [jpeg], imagePrompt: "a harbour at sunset, test pattern", imageParams: { seed: 42, steps: 20, width: 64, height: 48 } },
        ],
      });
      tx.oncomplete = () => done();
      tx.onerror = () => fail(tx.error);
    });
    db.close();
  }, ARIA);
  // Loaded again so the app reads the seed, then into the chat.
  await page.reload();
  await expect(frame.getByRole("heading", { name: "Welcome to Kindred" })).toHaveCount(0, { timeout: 30_000 });
  await page.frame({ url: (url) => url.origin === kindredOrigin })!.evaluate(() => {
    location.hash = "#/chat/1";
  });
  await frame.getByRole("img", { name: "Generated" }).click();
  await frame.getByRole("button", { name: "Save to library" }).click();
  await expect(frame.getByText("Saved to library")).toBeVisible();

  const saved = (await messages(page)).find((m) => m.type === "saveImage");
  expect(saved).toMatchObject({ rd: 1, type: "saveImage", prompt: "a harbour at sunset, test pattern", settings: { seed: 42, steps: 20, width: 64, height: 48 } });
  // A PNG's first bytes, in base64, with no data: prefix.
  expect(saved.png.startsWith("iVBORw0KGgo")).toBe(true);

  // Panic closes the open picture, so nothing is left open behind the cover.
  await expect(frame.getByRole("dialog")).toBeVisible();
  await send(page, { rd: 1, type: "panic" });
  await expect(frame.getByRole("dialog")).toHaveCount(0);
  await send(page, { rd: 1, type: "unpanic" });
  await expect(frame.locator('[data-slot="host-cover"]')).toHaveCount(0);
});
