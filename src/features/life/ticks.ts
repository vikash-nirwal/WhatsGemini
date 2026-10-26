// Life ticks (#191, #193): background jobs register the check they run on
// their timers, so a run of them can be asked for on demand - spread across
// your time away when you come back (catch-up), or a day's worth now
// (Simulate a day). Each check is given the moment it stands for.

type Tick = (at?: number) => Promise<unknown> | unknown;
const jobs = new Map<string, Tick>();

export const registerTick = (name: string, tick: Tick) => {
  jobs.set(name, tick);
  return () => {
    if (jobs.get(name) === tick) jobs.delete(name);
  };
};

export const tickJobs = () => Array.from(jobs.keys());

// Runs every job at each moment in turn, one at a time, so they don't all
// call the model at once. `onStep` reports progress.
export const runTicks = async (moments: (number | undefined)[], onStep?: (done: number, total: number) => void) => {
  const list = Array.from(jobs.values());
  const total = moments.length * list.length;
  let done = 0;
  for (const at of moments) {
    for (const tick of list) {
      try {
        await tick(at);
      } catch (err) {
        console.warn("A life tick failed (non-fatal):", err);
      }
      onStep?.(++done, total);
    }
  }
};

// Catch-up (#193): moments spread across the absence, one for every few
// hours of it (at most six), each in the middle of its stretch.
const STRETCH_MS = 4 * 60 * 60 * 1000;
export const catchUpMoments = (lastSeen: number, openedAt: number, max = 6): number[] => {
  const away = openedAt - lastSeen;
  if (away <= 0) return [];
  const n = Math.max(1, Math.min(max, Math.round(away / STRETCH_MS)));
  return Array.from({ length: n }, (_, k) => Math.round(lastSeen + (away * (k + 0.5)) / n));
};
