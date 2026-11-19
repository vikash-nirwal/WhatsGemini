import { nextProgress, ProgressState, socketUrl } from "./progress";

// What the bar shows from ComfyUI's WebSocket messages (2026-11-19).
const fresh = (promptId?: string): ProgressState => ({ promptId, started: new Set(), stage: 1 });

test("the socket address follows the server's", () => {
  expect(socketUrl("http://127.0.0.1:8188/", "abc")).toBe("ws://127.0.0.1:8188/ws?clientId=abc");
  expect(socketUrl("https://comfy.example", "a b")).toBe("wss://comfy.example/ws?clientId=a%20b");
});

test("waits in the queue, then counts the steps of our job only", () => {
  const state = fresh("p1");
  expect(nextProgress(state, { type: "status", data: { status: { exec_info: { queue_remaining: 3 } } } })).toEqual({ queueAhead: 2 });
  expect(nextProgress(state, { type: "progress", data: { prompt_id: "other", value: 4, max: 20 } })).toBeUndefined();
  expect(nextProgress(state, { type: "execution_start", data: { prompt_id: "p1" } })).toEqual({ queueAhead: 0 });
  expect(nextProgress(state, { type: "progress", data: { prompt_id: "p1", value: 5, max: 20 } })).toEqual({ queueAhead: 0, step: 5, steps: 20, stage: 1 });
});

test("a second sampler is a second stage", () => {
  const state = fresh("p1");
  nextProgress(state, { type: "execution_start", data: { prompt_id: "p1" } });
  nextProgress(state, { type: "progress", data: { prompt_id: "p1", value: 20, max: 20 } });
  expect(nextProgress(state, { type: "progress", data: { prompt_id: "p1", value: 1, max: 10 } })).toMatchObject({ step: 1, steps: 10, stage: 2 });
});

test("older ComfyUI without prompt ids counts once our job started", () => {
  const state = fresh("p1");
  expect(nextProgress(state, { type: "progress", data: { value: 1, max: 20 } })).toBeUndefined();
  nextProgress(state, { type: "execution_start", data: { prompt_id: "p1" } });
  expect(nextProgress(state, { type: "progress", data: { value: 2, max: 20 } })).toMatchObject({ step: 2 });
});
