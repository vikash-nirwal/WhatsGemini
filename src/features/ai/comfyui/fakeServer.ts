// A stand-in for a ComfyUI server in unit tests: a fetch function that
// answers the endpoints the adapter and Settings use, and records every call.
// Not used by the app itself.

export interface FakeCall {
  method: string;
  path: string;
  init?: RequestInit;
}

export interface FakeComfyOptions {
  // How many history polls come back empty ({}) before the result appears.
  pendingPolls?: number;
  promptStatus?: number;
  promptBody?: unknown;
  historyEntry?: unknown;
  // Node classes /object_info/{class} knows about; others come back {}.
  knownNodes?: Record<string, unknown>;
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const FAKE_PROMPT_ID = "prompt-123";

const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: async () => body,
  blob: async () => new Blob([PNG_BYTES], { type: "image/png" }),
});

export const createFakeComfy = (options: FakeComfyOptions = {}) => {
  const calls: FakeCall[] = [];
  let polls = 0;
  const historyEntry = options.historyEntry ?? {
    outputs: { "8": { images: [{ filename: "Kindred_00001_.png", subfolder: "", type: "output" }] } },
    status: { status_str: "success", completed: true, messages: [] },
  };

  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const method = (init?.method || "GET").toUpperCase();
    const path = parsed.pathname + parsed.search;
    calls.push({ method, path, init });

    if (method === "POST" && parsed.pathname === "/upload/image") {
      const file = (init?.body as FormData).get("image") as File;
      return reply(200, { name: file.name, subfolder: "", type: "input" });
    }
    if (method === "POST" && parsed.pathname === "/prompt") {
      return reply(options.promptStatus ?? 200, options.promptBody ?? { prompt_id: FAKE_PROMPT_ID, number: 1, node_errors: {} });
    }
    if (parsed.pathname.startsWith("/history/")) {
      polls++;
      return reply(200, polls <= (options.pendingPolls ?? 1) ? {} : { [FAKE_PROMPT_ID]: historyEntry });
    }
    if (parsed.pathname === "/view") return reply(200, undefined);
    if (parsed.pathname === "/system_stats") {
      return reply(200, {
        system: { comfyui_version: "0.3.60", os: "darwin" },
        devices: [{ name: "mps", type: "mps", vram_total: 17179869184, vram_free: 8589934592 }],
      });
    }
    if (parsed.pathname.startsWith("/object_info/")) {
      const classType = decodeURIComponent(parsed.pathname.slice("/object_info/".length));
      const known = options.knownNodes?.[classType];
      return reply(200, known ? { [classType]: known } : {});
    }
    if (method === "POST" && (parsed.pathname === "/queue" || parsed.pathname === "/interrupt")) return reply(200, {});
    return reply(404, {});
  };

  return {
    calls,
    fetch: fetchImpl,
    paths: () => calls.map((c) => `${c.method} ${c.path.split("?")[0]}`),
    queuedWorkflow: () => {
      const call = calls.find((c) => c.method === "POST" && c.path === "/prompt");
      return call ? JSON.parse(String(call.init?.body)).prompt : undefined;
    },
  };
};
