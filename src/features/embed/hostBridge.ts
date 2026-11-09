import { EMBEDDED_COMMIT, EMBEDDED_VERSION, IS_EMBEDDED } from "./embedded";

// The bridge to a host app (#264): protocol version 1, documented in
// docs/embedding.md. Kindred runs in the host's <iframe>, loaded with
// `?host=<the host's origin>`, and they talk with window.postMessage. Every
// message is `{ rd: 1, type, ... }`; other versions and unknown types are
// ignored. Kindred listens only to window.parent at that exact origin and
// posts only to it. Outside the embedded build, without `?host=`, or when not
// in a frame, the bridge is inert: it sends nothing and listens to nothing.

export const BRIDGE_VERSION = 1;
// The host refuses bigger pictures, so they aren't sent at all.
export const MAX_SAVE_BYTES = 25 * 1024 * 1024;
// How long a save waits for the host's `saved` reply.
const SAVE_TIMEOUT_MS = 60_000;

export interface AdaptStory {
  title: string;
  author?: string;
  text: string;
}

export interface SaveImageSettings {
  model?: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  width?: number;
  height?: number;
  tool?: string;
}

export interface SaveImageRequest {
  png: string; // base64 PNG, no data: prefix
  prompt: string;
  negative?: string;
  settings?: SaveImageSettings;
  name?: string;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

// The host's origin from `?host=`, or null when it's missing or isn't a bare
// http(s) origin (a path or anything else makes it unusable for the check).
export const hostOriginFrom = (search: string): string | null => {
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get("host");
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (raw !== url.origin && raw !== `${url.origin}/`) return null;
    return url.origin;
  } catch {
    return null;
  }
};

const isString = (v: unknown): v is string => typeof v === "string";

export const readAdaptStory = (value: unknown): AdaptStory | null => {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!isString(v.text) || !v.text.trim()) return null;
  return {
    title: isString(v.title) ? v.title : "",
    ...(isString(v.author) && v.author.trim() ? { author: v.author } : {}),
    text: v.text,
  };
};

// The size of the bytes a base64 string holds.
export const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

// What panic does besides the cover: speech and sound stop at once, and
// dialogs and menus close, so nothing is left open behind the cover.
const silenceAndClose = (doc: Document | undefined, win: Window) => {
  try {
    win.speechSynthesis?.cancel();
  } catch {
    // No speech in this browser.
  }
  if (!doc) return;
  doc.querySelectorAll("audio, video").forEach((el) => {
    try {
      (el as HTMLMediaElement).pause();
    } catch {
      // A media element that can't pause has nothing playing.
    }
  });
  // Radix closes its top layer (dialog, menu, popover) on Escape; one press
  // per layer, a frame apart so each close has rendered.
  let presses = 0;
  const press = () => {
    if (!doc.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') || presses++ >= 8) return;
    (doc.activeElement || doc.body)?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    win.setTimeout(press, 40);
  };
  press();
  (doc.activeElement as HTMLElement | null)?.blur?.();
};

export class HostBridge {
  readonly host: string | null;
  private readonly win: Window;
  private readonly parent: Window | null;
  private started = false;
  private readySent = false;
  private lastTitle: string | null = null;
  private covered = false;
  private pendingStory: AdaptStory | null = null;
  private saves: { resolve: (r: SaveResult) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  private coverListeners = new Set<() => void>();
  private panicListeners = new Set<() => void>();
  private openListeners = new Set<(story: AdaptStory) => void>();

  constructor(win: Window, embedded: boolean) {
    this.win = win;
    let inFrame = false;
    try {
      inFrame = Boolean(win.parent) && win.parent !== win;
    } catch {
      inFrame = false;
    }
    this.host = embedded && inFrame ? hostOriginFrom(win.location?.search || "") : null;
    this.parent = this.host ? win.parent : null;
  }

  get active() {
    return this.host !== null;
  }

  // Whether the blank cover is up (after panic or lock, until unpanic or open).
  get isCovered() {
    return this.covered;
  }

  start() {
    if (!this.active || this.started) return;
    this.started = true;
    this.win.addEventListener("message", this.onMessage);
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.win.removeEventListener("message", this.onMessage);
  }

  private post(type: string, body: Record<string, unknown> = {}) {
    if (!this.parent || !this.host) return false;
    this.parent.postMessage({ ...body, rd: BRIDGE_VERSION, type }, this.host);
    return true;
  }

  // Once the app has started; the host gives up on a build that never says so.
  sendReady() {
    if (this.readySent || !this.active) return;
    this.readySent = this.post("ready", { version: EMBEDDED_VERSION, commit: EMBEDDED_COMMIT, bridge: BRIDGE_VERSION });
  }

  sendTitle(text: string) {
    const clean = text.trim();
    if (!clean || clean === this.lastTitle) return;
    if (this.post("title", { text: clean })) this.lastTitle = clean;
  }

  // Sends a picture to the host's library and waits for its `saved` reply.
  // `saved` carries no id, so replies are matched to saves in order.
  saveImage(request: SaveImageRequest): Promise<SaveResult> {
    if (!this.active) return Promise.resolve({ ok: false, error: "Not running inside a host app." });
    if (base64Bytes(request.png) > MAX_SAVE_BYTES) return Promise.resolve({ ok: false, error: "The picture is over 25 MB." });
    return new Promise((resolve) => {
      const entry = {
        resolve,
        timer: setTimeout(() => {
          this.saves = this.saves.filter((s) => s !== entry);
          resolve({ ok: false, error: "The host app didn't answer." });
        }, SAVE_TIMEOUT_MS),
      };
      this.saves.push(entry);
      const body: Record<string, unknown> = { png: request.png, prompt: request.prompt };
      if (request.negative) body.negative = request.negative;
      if (request.settings && Object.keys(request.settings).length) body.settings = request.settings;
      if (request.name) body.name = request.name;
      this.post("saveImage", body);
    });
  }

  // For React's useSyncExternalStore: called when the cover goes up or down.
  subscribe = (listener: () => void) => {
    this.coverListeners.add(listener);
    return () => {
      this.coverListeners.delete(listener);
    };
  };

  // Extra work on panic, such as stopping a chat's ambient sound.
  onPanic(listener: () => void) {
    this.panicListeners.add(listener);
    return () => {
      this.panicListeners.delete(listener);
    };
  }

  // Story requests from the host. One that came before anyone listened (the
  // app was still starting) is handed to the first listener.
  onOpen(listener: (story: AdaptStory) => void) {
    this.openListeners.add(listener);
    if (this.pendingStory) {
      const story = this.pendingStory;
      this.pendingStory = null;
      listener(story);
    }
    return () => {
      this.openListeners.delete(listener);
    };
  }

  private setCovered(covered: boolean) {
    if (this.covered === covered) return;
    this.covered = covered;
    this.coverListeners.forEach((l) => l());
  }

  private panic() {
    silenceAndClose(typeof document === "undefined" ? undefined : document, this.win);
    this.panicListeners.forEach((l) => {
      try {
        l();
      } catch {
        // One listener failing mustn't keep the others from stopping.
      }
    });
    this.setCovered(true);
  }

  private onMessage = (event: MessageEvent) => {
    if (!this.parent || event.source !== this.parent || event.origin !== this.host) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || typeof data !== "object" || data.rd !== BRIDGE_VERSION || !isString(data.type)) return;
    switch (data.type) {
      case "panic":
      case "lock":
        this.panic();
        break;
      case "unpanic":
        this.setCovered(false);
        break;
      case "open": {
        const story = readAdaptStory(data.adaptStory);
        if (!story) return;
        this.setCovered(false);
        if (this.openListeners.size) this.openListeners.forEach((l) => l(story));
        else this.pendingStory = story;
        break;
      }
      case "saved": {
        const next = this.saves.shift();
        if (!next) return;
        clearTimeout(next.timer);
        next.resolve({ ok: data.ok === true, ...(data.ok !== true ? { error: isString(data.error) && data.error ? data.error : "The host app couldn't save it." } : {}) });
        break;
      }
      // "theme" is advisory: Kindred keeps its own look.
      default:
        break;
    }
  };
}

export const hostBridge = new HostBridge(window, IS_EMBEDDED);
