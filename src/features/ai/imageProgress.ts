// A picture being drawn for a chat (the user's ask, 2026-11-19): the reply
// shows first, and a bar above the message box says how the picture is
// coming. ComfyUI reports its queue and its sampler's steps
// (comfyui/progress.ts); other providers only say that they're drawing.

export interface ImageProgress {
  // The chat the picture is for, so the bar shows in that chat only.
  chatId: number;
  // Waiting behind other jobs in ComfyUI's queue.
  queueAhead?: number;
  // The sampler's steps, and which sampler when a workflow has more than one.
  step?: number;
  steps?: number;
  stage?: number;
}

let current: ImageProgress | null = null;
const watchers = new Set<(p: ImageProgress | null) => void>();
const emit = () => watchers.forEach((fn) => fn(current));

export const imageProgress = () => current;

export const watchImageProgress = (fn: (p: ImageProgress | null) => void) => {
  watchers.add(fn);
  return () => void watchers.delete(fn);
};

// Returns the function that ends it, which only ends its own picture.
// Updates replace the record, so each picture is known by its own number.
let drawing = 0;
export const startImageProgress = (chatId: number): (() => void) => {
  const mine = ++drawing;
  current = { chatId };
  emit();
  return () => {
    if (drawing === mine && current) {
      current = null;
      emit();
    }
  };
};

// From the provider, for whichever picture is being drawn now.
export const reportImageProgress = (patch: Partial<Omit<ImageProgress, "chatId">>) => {
  if (!current) return;
  current = { ...current, ...patch };
  emit();
};
