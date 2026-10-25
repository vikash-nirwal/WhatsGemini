import { Page, Route } from "@playwright/test";
import fs from "fs";
import path from "path";
import ts from "typescript";

// Helpers for the ComfyUI specs: a page.route mock of a ComfyUI server, and
// a way to run the adapter's own source in a real browser without the app
// (or the dev server) involved.

export const COMFY_URL = "http://127.0.0.1:8188";
// A made-up localhost origin, answered entirely by page.route. localhost
// keeps it a secure context, like the real app, and lets it call 127.0.0.1.
export const HARNESS_ORIGIN = "http://localhost:4317";

// One opaque 1x1 PNG.
export const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export interface ComfyRequest {
  method: string;
  path: string;
  body?: any;
  uploadName?: string;
}

export interface MockComfyOptions {
  // Act like ComfyUI started without --enable-cors-header.
  noCors?: boolean;
  pendingPolls?: number;
  // Node classes /object_info/{class} knows; anything else comes back {}.
  knownNodes?: Record<string, unknown>;
}

export const PROMPT_ID = "e2e-prompt-1";

export const mockComfyUI = async (page: Page, options: MockComfyOptions = {}) => {
  const requests: ComfyRequest[] = [];
  let polls = 0;
  const cors: Record<string, string> = options.noCors
    ? {}
    : {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });

  await page.route(`${COMFY_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    // route.fulfill doesn't enforce CORS, so leaving the header out isn't
    // enough: a CORS-mode request is failed the way the browser would block
    // it, while the adapter's no-cors probe still gets an answer. Chromium
    // doesn't show Sec-Fetch-Mode to routes, but only CORS-mode requests
    // carry an Origin header there.
    if (options.noCors) {
      const headers = await request.allHeaders();
      const corsMode = headers["sec-fetch-mode"] ? headers["sec-fetch-mode"] !== "no-cors" : "origin" in headers;
      if (corsMode) return route.abort("failed");
    }
    const entry: ComfyRequest = { method, path: url.pathname + url.search };
    requests.push(entry);

    if (method === "POST" && url.pathname === "/upload/image") {
      const raw = request.postDataBuffer()?.toString("latin1") || "";
      entry.uploadName = /filename="([^"]+)"/.exec(raw)?.[1];
      return json(route, { name: entry.uploadName, subfolder: "", type: "input" });
    }
    if (method === "POST" && url.pathname === "/prompt") {
      entry.body = request.postDataJSON();
      return json(route, { prompt_id: PROMPT_ID, number: 1, node_errors: {} });
    }
    if (url.pathname === `/history/${PROMPT_ID}`) {
      polls++;
      if (polls <= (options.pendingPolls ?? 1)) return json(route, {});
      return json(route, {
        [PROMPT_ID]: {
          outputs: { "8": { images: [{ filename: "Kindred_00001_.png", subfolder: "", type: "output" }] } },
          status: { status_str: "success", completed: true, messages: [] },
        },
      });
    }
    if (url.pathname === "/view") {
      return route.fulfill({ status: 200, contentType: "image/png", headers: cors, body: Buffer.from(PNG_BASE64, "base64") });
    }
    if (url.pathname === "/system_stats") {
      return json(route, {
        system: { comfyui_version: "0.3.60", os: "posix" },
        devices: [{ name: "cuda:0 NVIDIA GeForce RTX 3060", type: "cuda", vram_total: 12884901888, vram_free: 11811160064 }],
      });
    }
    if (url.pathname.startsWith("/object_info/")) {
      const classType = decodeURIComponent(url.pathname.slice("/object_info/".length));
      const known = options.knownNodes?.[classType];
      return json(route, known ? { [classType]: known } : {});
    }
    if (method === "POST" && (url.pathname === "/queue" || url.pathname === "/interrupt")) return json(route, {});
    return json(route, { error: "not found" }, 404);
  });

  return {
    requests,
    sequence: () => requests.map((r) => `${r.method} ${r.path.split("?")[0]}`),
    queuedWorkflow: () => requests.find((r) => r.path === "/prompt")?.body?.prompt,
  };
};

const ROOT = path.resolve(__dirname, "..");

// Serves the repository's TypeScript sources as browser ES modules,
// transpiled on request, so a spec can `import()` the adapter in the page.
// Extensionless imports ("../comfyui/client") resolve to the .ts file.
export const openSourceHarness = async (page: Page) => {
  await page.route(`${HARNESS_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>ComfyUI adapter harness</title>" });
    }
    const base = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!base.startsWith(path.join(ROOT, "src"))) return route.fulfill({ status: 403, body: "" });
    const file = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file) return route.fulfill({ status: 404, body: `no source for ${url.pathname}` });
    const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      fileName: file,
    });
    return route.fulfill({ status: 200, contentType: "text/javascript", body: outputText });
  });
  await page.goto(`${HARNESS_ORIGIN}/`);
};
