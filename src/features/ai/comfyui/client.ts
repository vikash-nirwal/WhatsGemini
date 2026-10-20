import type { ComfyWorkflow } from "./workflow";

// The HTTP side of ComfyUI, straight from the browser: the app has no server
// of its own, so ComfyUI has to allow this page's origin, which it only does
// when started with --enable-cors-header.

export const LAUNCH_HINT = "python main.py --enable-cors-header";

export class ComfyUIConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComfyUIConnectionError";
  }
}

export const normalizeServerUrl = (url: string): string => (url.trim() || "http://127.0.0.1:8188").replace(/\/+$/, "");

const abortError = (signal?: AbortSignal): Error =>
  signal?.reason instanceof Error ? signal.reason : new DOMException("ComfyUI image generation aborted.", "AbortError");

const isLoopback = (url: string): boolean => {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
  } catch {
    return false;
  }
};

// A failed fetch only says "Failed to fetch", whether ComfyUI is down or is
// up but sends no CORS header. A no-cors request tells them apart: it
// succeeds (with an unreadable reply) whenever the server answers at all.
const diagnose = async (serverUrl: string): Promise<ComfyUIConnectionError> => {
  const pageIsHttps = typeof window !== "undefined" && window.location?.protocol === "https:";
  if (pageIsHttps && serverUrl.startsWith("http:") && !isLoopback(serverUrl)) {
    return new ComfyUIConnectionError(
      `The browser blocked the request to ${serverUrl}: this page is served over https, and an http address on another machine counts as insecure. Use ComfyUI on this computer (127.0.0.1), or put it behind https.`
    );
  }
  try {
    await fetch(`${serverUrl}/system_stats`, { mode: "no-cors" });
    return new ComfyUIConnectionError(
      `ComfyUI at ${serverUrl} is running, but the browser blocked its reply (CORS). Restart ComfyUI with the --enable-cors-header flag, e.g. "${LAUNCH_HINT}".`
    );
  } catch {
    return new ComfyUIConnectionError(
      `Can't reach ComfyUI at ${serverUrl}. Check that it's running and the address in Settings is right, and start it with "${LAUNCH_HINT}" so this app may call it.`
    );
  }
};

export const comfyFetch = async (serverUrl: string, path: string, init: RequestInit = {}): Promise<Response> => {
  const signal = init.signal || undefined;
  if (signal?.aborted) throw abortError(signal);
  try {
    return await fetch(`${serverUrl}${path}`, init);
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) throw abortError(signal);
    throw await diagnose(serverUrl);
  }
};

const truncate = (text: string, max = 240) => (text.length > max ? `${text.slice(0, max)}…` : text);

interface NodeError {
  class_type?: string;
  errors?: { message?: string; details?: string }[];
}

// POST /prompt rejects a workflow before running it when a node class is
// unknown (a custom node pack is missing) or an input is invalid (a model file
// that isn't installed). Its reply names the node, so pass that on.
export const describePromptError = (status: number, body: any): string => {
  const parts: string[] = [];
  const top = body?.error;
  if (top?.message) parts.push(top.details ? `${top.message} (${truncate(String(top.details))})` : top.message);
  const nodeErrors: Record<string, NodeError> = body?.node_errors || {};
  for (const [nodeId, nodeError] of Object.entries(nodeErrors)) {
    for (const e of nodeError.errors || []) {
      parts.push(`node ${nodeId} (${nodeError.class_type || "?"}): ${e.message || "error"}${e.details ? ` - ${truncate(e.details)}` : ""}`);
    }
  }
  let message = `ComfyUI rejected the workflow: ${parts.join("; ") || `HTTP ${status}`}`;
  if (/does not exist/i.test(message)) {
    message += ". Install the custom nodes this template needs (listed in Settings) and restart ComfyUI.";
  } else if (/not in list/i.test(message)) {
    message += ". Pick a model file that's installed in ComfyUI, in Settings.";
  }
  return message;
};

export const uploadImage = async (
  serverUrl: string,
  data: string,
  mimeType: string,
  filename: string,
  signal?: AbortSignal
): Promise<string> => {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: mimeType }), filename);
  form.append("type", "input");
  form.append("overwrite", "true");
  const res = await comfyFetch(serverUrl, "/upload/image", { method: "POST", body: form, signal });
  if (!res.ok) throw new Error(`ComfyUI couldn't take the reference image: HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.name) throw new Error("ComfyUI's upload reply had no file name.");
  // LoadImage expects the path relative to ComfyUI's input folder.
  return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
};

export const queuePrompt = async (
  serverUrl: string,
  workflow: ComfyWorkflow,
  clientId: string,
  signal?: AbortSignal
): Promise<string> => {
  const res = await comfyFetch(serverUrl, "/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal,
  });
  let body: any;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (!res.ok) throw new Error(describePromptError(res.status, body));
  if (!body?.prompt_id) throw new Error("ComfyUI accepted the workflow but returned no prompt_id.");
  return body.prompt_id;
};

export interface OutputImage {
  filename: string;
  subfolder: string;
  type: string;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const executionError = (entry: any): string | undefined => {
  const messages: any[] = entry?.status?.messages || [];
  const found = messages.find((m) => Array.isArray(m) && m[0] === "execution_error");
  if (found) {
    const info = found[1] || {};
    let text = `ComfyUI failed in node ${info.node_id ?? "?"} (${info.node_type || "?"}): ${truncate(String(info.exception_message || "unknown error").trim())}`;
    if (/insightface/i.test(text)) text += ". FaceID needs the insightface package in ComfyUI's Python (pip install insightface onnxruntime).";
    return text;
  }
  if (entry?.status?.status_str === "error") return "ComfyUI reported an error while running the workflow.";
  return undefined;
};

// Best effort: take the prompt off the queue, or stop it if it's running.
// Newer ComfyUI only interrupts the given prompt_id; older ones interrupt
// whatever is running, which on a local, single-user server is this one.
export const cancelPrompt = async (serverUrl: string, promptId: string): Promise<void> => {
  const post = (path: string, body: unknown) =>
    fetch(`${serverUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
  await Promise.all([post("/queue", { delete: [promptId] }), post("/interrupt", { prompt_id: promptId })]);
};

// GET /history/{id} stays {} until the prompt has finished (or failed).
export const waitForOutputs = async (
  serverUrl: string,
  promptId: string,
  opts: { signal?: AbortSignal; pollIntervalMs: number; timeoutMs: number }
): Promise<OutputImage[]> => {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const res = await comfyFetch(serverUrl, `/history/${encodeURIComponent(promptId)}`, { signal: opts.signal });
    if (!res.ok) throw new Error(`ComfyUI history error: HTTP ${res.status}`);
    const body = await res.json();
    const entry = body?.[promptId];
    if (entry) {
      const error = executionError(entry);
      if (error) throw new Error(error);
      const outputs: Record<string, { images?: OutputImage[] }> = entry.outputs || {};
      const images = Object.values(outputs).flatMap((o) => o.images || []);
      const finished = entry.status ? entry.status.completed !== false : true;
      if (finished) {
        // SaveImage results are "output"; PreviewImage ones are "temp".
        // Prefer the saved ones when a workflow has both.
        const saved = images.filter((i) => i.type === "output");
        const picked = saved.length > 0 ? saved : images;
        if (picked.length === 0) {
          throw new Error("ComfyUI finished without an image. Does the workflow end in a SaveImage or PreviewImage node?");
        }
        return picked;
      }
    }
    await sleep(opts.pollIntervalMs, opts.signal);
  }
  throw new Error("ComfyUI took too long to finish this picture. It may still be running; check ComfyUI's console.");
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Couldn't read the image.")));
    reader.onerror = () => reject(new Error("Couldn't read the image."));
    reader.readAsDataURL(blob);
  });

export const fetchOutputImage = async (serverUrl: string, image: OutputImage, signal?: AbortSignal): Promise<string> => {
  const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || "", type: image.type || "output" });
  const res = await comfyFetch(serverUrl, `/view?${query.toString()}`, { signal });
  if (!res.ok) throw new Error(`ComfyUI couldn't send the image ${image.filename}: HTTP ${res.status}`);
  return blobToDataUrl(await res.blob());
};

export interface SystemStats {
  version?: string;
  devices: { name: string; type: string; vramTotal: number; vramFree: number }[];
}

export const getSystemStats = async (serverUrl: string, signal?: AbortSignal): Promise<SystemStats> => {
  const res = await comfyFetch(serverUrl, "/system_stats", { signal });
  if (!res.ok) throw new Error(`ComfyUI answered with HTTP ${res.status}. Is this a ComfyUI server?`);
  const body = await res.json();
  return {
    version: body?.system?.comfyui_version,
    devices: (body?.devices || []).map((d: any) => ({
      name: String(d.name || d.type || "device"),
      type: String(d.type || ""),
      vramTotal: Number(d.vram_total) || 0,
      vramFree: Number(d.vram_free) || 0,
    })),
  };
};

// GET /object_info/{class} returns {} for a class ComfyUI doesn't know, which
// is how a missing custom node pack shows up.
const getNodeInfo = async (serverUrl: string, classType: string, signal?: AbortSignal): Promise<any | undefined> => {
  const res = await comfyFetch(serverUrl, `/object_info/${encodeURIComponent(classType)}`, { signal });
  if (!res.ok) return undefined;
  const body = await res.json();
  return body?.[classType];
};

export const findMissingNodes = async (serverUrl: string, classTypes: string[], signal?: AbortSignal): Promise<string[]> => {
  const results = await Promise.all(classTypes.map(async (c) => ((await getNodeInfo(serverUrl, c, signal)) ? undefined : c)));
  return results.filter((c): c is string => Boolean(c));
};

// The file names a loader's dropdown offers, e.g. the installed checkpoints.
// ComfyUI describes a dropdown either as [[...options]] or, since 2025, as
// ["COMBO", { options: [...] }].
export const listInputOptions = async (
  serverUrl: string,
  classType: string,
  input: string,
  signal?: AbortSignal
): Promise<string[]> => {
  const info = await getNodeInfo(serverUrl, classType, signal);
  const spec = info?.input?.required?.[input] ?? info?.input?.optional?.[input];
  if (!Array.isArray(spec)) return [];
  if (Array.isArray(spec[0])) return spec[0].map(String);
  if (spec[0] === "COMBO" && Array.isArray(spec[1]?.options)) return spec[1].options.map(String);
  return [];
};
