import { HostBridge, base64Bytes, hostOriginFrom, readAdaptStory } from "./hostBridge";

const HOST = "http://127.0.0.1:8765";

// A stand-in window inside a frame: its parent records what's posted to it,
// and message listeners are called directly with plain events.
const makeWindow = (search: string, opts: { inFrame?: boolean } = {}) => {
  const posted: { message: any; target: string }[] = [];
  const parent = { postMessage: (message: any, target: string) => posted.push({ message, target }) };
  const listeners: ((e: any) => void)[] = [];
  const win: any = {
    location: { search },
    addEventListener: (type: string, fn: (e: any) => void) => type === "message" && listeners.push(fn),
    removeEventListener: (type: string, fn: (e: any) => void) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  };
  win.parent = opts.inFrame === false ? win : parent;
  const deliver = (data: any, origin = HOST, source: any = parent) => listeners.forEach((l) => l({ data, origin, source }));
  return { win: win as Window, parent, posted, listeners, deliver };
};

const started = (search = `?host=${encodeURIComponent(HOST)}`, embedded = true) => {
  const w = makeWindow(search);
  const bridge = new HostBridge(w.win, embedded);
  bridge.start();
  return { ...w, bridge };
};

describe("hostOriginFrom", () => {
  it("takes a bare http(s) origin", () => {
    expect(hostOriginFrom(`?host=${encodeURIComponent(HOST)}`)).toBe(HOST);
    expect(hostOriginFrom("?host=https%3A%2F%2Fexample.test%2F")).toBe("https://example.test");
  });

  it("refuses anything else", () => {
    expect(hostOriginFrom("")).toBeNull();
    expect(hostOriginFrom("?host=")).toBeNull();
    expect(hostOriginFrom("?host=not%20a%20url")).toBeNull();
    expect(hostOriginFrom("?host=javascript%3Aalert(1)")).toBeNull();
    expect(hostOriginFrom("?host=http%3A%2F%2Fexample.test%2Fpath")).toBeNull();
    expect(hostOriginFrom("?host=file%3A%2F%2F%2Ftmp")).toBeNull();
  });
});

describe("HostBridge when inert", () => {
  it("does nothing in the normal build", () => {
    const w = makeWindow(`?host=${encodeURIComponent(HOST)}`);
    const bridge = new HostBridge(w.win, false);
    bridge.start();
    bridge.sendReady();
    bridge.sendTitle("Chats");
    expect(bridge.active).toBe(false);
    expect(w.listeners).toHaveLength(0);
    expect(w.posted).toHaveLength(0);
  });

  it("does nothing without ?host= or outside a frame", () => {
    const noHost = makeWindow("");
    const a = new HostBridge(noHost.win, true);
    a.start();
    a.sendReady();
    expect(a.active).toBe(false);
    expect(noHost.listeners).toHaveLength(0);
    expect(noHost.posted).toHaveLength(0);

    const top = makeWindow(`?host=${encodeURIComponent(HOST)}`, { inFrame: false });
    const b = new HostBridge(top.win, true);
    b.start();
    expect(b.active).toBe(false);
    expect(top.listeners).toHaveLength(0);
  });

  it("answers a save without a host with an error", async () => {
    const bridge = new HostBridge(makeWindow("").win, true);
    await expect(bridge.saveImage({ png: "AAAA", prompt: "p" })).resolves.toEqual({ ok: false, error: expect.any(String) });
  });
});

describe("HostBridge sending", () => {
  it("says ready once, to the host's origin only", () => {
    const { bridge, posted } = started();
    bridge.sendReady();
    bridge.sendReady();
    expect(posted).toHaveLength(1);
    expect(posted[0].target).toBe(HOST);
    expect(posted[0].message).toMatchObject({ rd: 1, type: "ready", bridge: 1 });
    expect(posted[0].message).toHaveProperty("version");
    expect(posted[0].message).toHaveProperty("commit");
  });

  it("sends a title when it changes", () => {
    const { bridge, posted } = started();
    bridge.sendTitle("Chats");
    bridge.sendTitle("Chats");
    bridge.sendTitle("  ");
    bridge.sendTitle("Stories");
    expect(posted.map((p) => p.message)).toEqual([
      { rd: 1, type: "title", text: "Chats" },
      { rd: 1, type: "title", text: "Stories" },
    ]);
  });
});

describe("HostBridge receiving", () => {
  it("covers on panic and lock, uncovers on unpanic", () => {
    const { bridge, deliver } = started();
    const changes = jest.fn();
    const stopped = jest.fn();
    bridge.subscribe(changes);
    bridge.onPanic(stopped);
    deliver({ rd: 1, type: "panic" });
    expect(bridge.isCovered).toBe(true);
    expect(stopped).toHaveBeenCalledTimes(1);
    deliver({ rd: 1, type: "unpanic" });
    expect(bridge.isCovered).toBe(false);
    deliver({ rd: 1, type: "lock" });
    expect(bridge.isCovered).toBe(true);
    expect(stopped).toHaveBeenCalledTimes(2);
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it("stops speech on panic", () => {
    const cancel = jest.fn();
    const { win, deliver } = started();
    (win as any).speechSynthesis = { cancel };
    deliver({ rd: 1, type: "panic" });
    expect(cancel).toHaveBeenCalled();
  });

  it("ignores messages from another origin or another window", () => {
    const { bridge, deliver } = started();
    deliver({ rd: 1, type: "panic" }, "http://evil.test");
    deliver({ rd: 1, type: "panic" }, HOST, { postMessage: () => undefined });
    deliver({ rd: 1, type: "panic" }, HOST, null);
    expect(bridge.isCovered).toBe(false);
  });

  it("ignores other protocol versions, unknown types and junk", () => {
    const { bridge, deliver } = started();
    deliver({ rd: 2, type: "panic" });
    deliver({ type: "panic" });
    deliver({ rd: "1", type: "panic" });
    deliver({ rd: 1, type: "launch-missiles" });
    deliver({ rd: 1, type: "theme", scheme: "dark" });
    deliver("panic");
    deliver(null);
    expect(bridge.isCovered).toBe(false);
  });

  it("hands a story to open to listeners, or keeps it for the first one", () => {
    const { bridge, deliver } = started();
    deliver({ rd: 1, type: "panic" });
    deliver({ rd: 1, type: "open", adaptStory: { title: "The Lighthouse", author: "A. Writer", text: "Once upon a time." } });
    // Opening a story is a navigation: the cover comes down.
    expect(bridge.isCovered).toBe(false);
    const listener = jest.fn();
    bridge.onOpen(listener);
    expect(listener).toHaveBeenCalledWith({ title: "The Lighthouse", author: "A. Writer", text: "Once upon a time." });
    deliver({ rd: 1, type: "open", adaptStory: { title: "Second", text: "More." } });
    expect(listener).toHaveBeenLastCalledWith({ title: "Second", text: "More." });
    deliver({ rd: 1, type: "open", adaptStory: { title: "No text" } });
    deliver({ rd: 1, type: "open" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("matches saved replies to saves in order", async () => {
    const { bridge, deliver, posted } = started();
    const first = bridge.saveImage({ png: "iVBORw0KGgo=", prompt: "a lighthouse at dusk", negative: "blurry", settings: { seed: 7, model: "test" }, name: "lighthouse" });
    const second = bridge.saveImage({ png: "iVBORw0KGgo=", prompt: "a harbour" });
    expect(posted.map((p) => p.message)).toEqual([
      { rd: 1, type: "saveImage", png: "iVBORw0KGgo=", prompt: "a lighthouse at dusk", negative: "blurry", settings: { seed: 7, model: "test" }, name: "lighthouse" },
      { rd: 1, type: "saveImage", png: "iVBORw0KGgo=", prompt: "a harbour" },
    ]);
    deliver({ rd: 1, type: "saved", ok: true });
    deliver({ rd: 1, type: "saved", ok: false, error: "Disk full" });
    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: false, error: "Disk full" });
    // A stray reply with nothing waiting is ignored.
    deliver({ rd: 1, type: "saved", ok: true });
  });

  it("refuses pictures over 25 MB without sending them", async () => {
    const { bridge, posted } = started();
    const big = "A".repeat(Math.ceil((25 * 1024 * 1024 * 4) / 3) + 8);
    await expect(bridge.saveImage({ png: big, prompt: "p" })).resolves.toEqual({ ok: false, error: expect.stringContaining("25 MB") });
    expect(posted).toHaveLength(0);
  });

  it("stops listening when stopped", () => {
    const { bridge, listeners } = started();
    bridge.stop();
    expect(listeners).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("reads a story to adapt", () => {
    expect(readAdaptStory({ title: "T", text: "x" })).toEqual({ title: "T", text: "x" });
    expect(readAdaptStory({ text: "x", author: " " })).toEqual({ title: "", text: "x" });
    expect(readAdaptStory({ title: "T", text: "  " })).toBeNull();
    expect(readAdaptStory("text")).toBeNull();
  });

  it("counts base64 bytes", () => {
    expect(base64Bytes(btoa("abc"))).toBe(3);
    expect(base64Bytes(btoa("abcd"))).toBe(4);
    expect(base64Bytes(btoa("abcde"))).toBe(5);
  });
});
