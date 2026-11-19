import { reportImageProgress } from "../imageProgress";

// ComfyUI's progress (2026-11-19): besides answering its HTTP API, ComfyUI
// tells a connected client, over a WebSocket, how long its queue is, when a
// job starts, and each step of its sampler. The adapter still waits for the
// picture by polling; this only feeds the bar above the message box
// (imageProgress.ts), so a server that refuses the socket changes nothing.

type ComfyMessage = { type?: string; data?: { prompt_id?: string; value?: number; max?: number; node?: string | null; status?: { exec_info?: { queue_remaining?: number } } } };

export const socketUrl = (serverUrl: string, clientId: string): string =>
  `${serverUrl.replace(/^http/i, "ws").replace(/\/+$/, "")}/ws?clientId=${encodeURIComponent(clientId)}`;

// What the bar shows after one message, given what it showed before. Pure,
// so it can be tested without a socket.
export interface ProgressState {
  promptId?: string;
  started: Set<string>;
  queueRemaining?: number;
  step?: number;
  steps?: number;
  stage: number;
}

export const nextProgress = (state: ProgressState, message: ComfyMessage): Partial<{ queueAhead: number; step: number; steps: number; stage: number }> | undefined => {
  const data = message.data || {};
  const ours = (id?: string) => Boolean(state.promptId && id === state.promptId);
  switch (message.type) {
    case "status": {
      state.queueRemaining = data.status?.exec_info?.queue_remaining;
      if (state.promptId && !state.started.has(state.promptId) && state.queueRemaining != null) return { queueAhead: Math.max(0, state.queueRemaining - 1) };
      return undefined;
    }
    case "execution_start":
      if (data.prompt_id) state.started.add(data.prompt_id);
      return ours(data.prompt_id) ? { queueAhead: 0 } : undefined;
    case "progress": {
      // Older ComfyUI leaves prompt_id out of progress; then only once ours started.
      if (data.prompt_id ? !ours(data.prompt_id) : !(state.promptId && state.started.has(state.promptId))) return undefined;
      if (typeof data.value !== "number" || typeof data.max !== "number") return undefined;
      // The steps start over: a second sampler (a refiner, an upscale pass).
      if (state.step != null && data.value < state.step) state.stage += 1;
      state.step = data.value;
      state.steps = data.max;
      return { queueAhead: 0, step: data.value, steps: data.max, stage: state.stage };
    }
    default:
      return undefined;
  }
};

export const watchComfyProgress = (serverUrl: string, clientId: string) => {
  const state: ProgressState = { started: new Set(), stage: 1 };
  let socket: WebSocket | undefined;
  try {
    socket = new WebSocket(socketUrl(serverUrl, clientId));
    socket.onmessage = (event) => {
      // Binary frames are preview pictures, which the bar doesn't show.
      if (typeof event.data !== "string") return;
      try {
        const patch = nextProgress(state, JSON.parse(event.data));
        if (patch) reportImageProgress(patch);
      } catch {
        // Not a message we know.
      }
    };
    socket.onerror = () => undefined;
  } catch {
    socket = undefined;
  }
  return {
    // The job's id, once ComfyUI has queued it.
    track(promptId: string) {
      state.promptId = promptId;
      if (!state.started.has(promptId) && state.queueRemaining != null && state.queueRemaining > 1) reportImageProgress({ queueAhead: state.queueRemaining - 1 });
    },
    close() {
      try {
        socket?.close();
      } catch {
        // Already closed.
      }
    },
  };
};
