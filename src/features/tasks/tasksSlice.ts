import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "sonner";

// Background tasks (the user's ask, 2026-10-28): anything you start that
// takes a while - an announcement, passing the time, a simulated day,
// pictures in the playground, a suggestion - keeps going when you switch
// screens. It always did run on (nothing stopped it), but its progress and
// its result lived in the screen: leave and come back, and the button was
// free again (so it ran twice) and a suggestion or picture was gone. Now a
// task is kept here: a toast follows it on every screen, the screen that
// started it reads whether it's still running, and what it made is kept
// under its key until that screen takes it.

export interface TaskInfo {
  id: string;
  kind: string; // what it is ("announce", "playground", ...)
  key: string; // what it's about (a world's id, ...), so a screen finds its own
  label: string;
  startedAt: number;
  progress?: number; // 0-100, when the task can tell
}

interface TasksState {
  running: TaskInfo[];
  // What tasks made, by key, for the screen that shows it.
  outputs: Record<string, unknown[]>;
}

const initialState: TasksState = { running: [], outputs: {} };

const tasksSlice = createSlice({
  name: "tasks",
  initialState,
  reducers: {
    taskStarted: (state, action: PayloadAction<TaskInfo>) => {
      state.running.push(action.payload);
    },
    taskProgress: (state, action: PayloadAction<{ id: string; progress: number }>) => {
      const t = state.running.find((x) => x.id === action.payload.id);
      if (t) t.progress = action.payload.progress;
    },
    taskFinished: (state, action: PayloadAction<string>) => {
      state.running = state.running.filter((t) => t.id !== action.payload);
    },
    outputAdded: (state, action: PayloadAction<{ key: string; item: unknown; first?: boolean }>) => {
      const list = state.outputs[action.payload.key] || [];
      state.outputs[action.payload.key] = action.payload.first ? [action.payload.item, ...list] : [...list, action.payload.item];
    },
    outputsSet: (state, action: PayloadAction<{ key: string; items: unknown[] }>) => {
      if (action.payload.items.length) state.outputs[action.payload.key] = action.payload.items;
      else delete state.outputs[action.payload.key];
    },
  },
});

export const { taskStarted, taskProgress, taskFinished, outputAdded, outputsSet } = tasksSlice.actions;
export default tasksSlice.reducer;

type Dispatch = (action: any) => any;

export interface TaskOptions<T> {
  kind: string;
  key: string;
  label: string; // "Announcing to Harbour Town"
  path?: string; // where its result shows, for the toast's View button
  // What the toast says when it's done; its own button (Undo, say) wins over View.
  done?: (result: T) => { title: string; description?: string; action?: { label: string; onClick: () => void } } | undefined;
  failed?: string;
  quiet?: boolean; // no toasts: the screen says it itself (short suggestions)
}

const openPath = (path: string) => {
  window.location.hash = `#${path}`;
};

// Runs `work` as a task. Resolves to its result, or rejects as it did -
// after the toast has said so.
export const runTask = <T,>(opts: TaskOptions<T>, work: (report: (progress: number) => void) => Promise<T>) => async (dispatch: Dispatch): Promise<T> => {
  const id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  dispatch(taskStarted({ id, kind: opts.kind, key: opts.key, label: opts.label, startedAt: Date.now() }));
  if (!opts.quiet) toast.loading(`${opts.label}...`, { id, description: "It carries on if you go elsewhere." });
  const report = (progress: number) => {
    dispatch(taskProgress({ id, progress }));
    if (!opts.quiet) toast.loading(`${opts.label}... ${progress}%`, { id, description: "It carries on if you go elsewhere." });
  };
  try {
    const result = await work(report);
    const said = opts.done?.(result);
    if (!opts.quiet && said) toast.success(said.title, { id, description: said.description, duration: 6000, ...(said.action ? { action: said.action } : opts.path ? { action: { label: "View", onClick: () => openPath(opts.path!) } } : {}) });
    else if (!opts.quiet) toast.dismiss(id);
    return result;
  } catch (err) {
    if (!opts.quiet) toast.error(opts.failed || `${opts.label} didn't finish.`, { id, description: err instanceof Error ? err.message : typeof err === "string" ? err : undefined, duration: 8000 });
    throw err;
  } finally {
    dispatch(taskFinished(id));
  }
};

export const runningTask = (state: { tasks: TasksState }, kind: string, key: string): TaskInfo | undefined =>
  state.tasks.running.find((t) => t.kind === kind && t.key === key);
