import { jobNames, runEveryJob } from "./scheduler";

// Life ticks (#191, #193): every background job can be asked for a run on
// demand - spread across your time away when you come back (catch-up), or
// a day's worth now (Simulate a day). Each run is given the moment it
// stands for. The jobs themselves are registered with the scheduler (#209).

export const tickJobs = jobNames;

// Runs every job at each moment in turn, one at a time through the
// scheduler's queue, so they don't all call the model at once. `onStep`
// reports progress.
export const runTicks = async (moments: (number | undefined)[], onStep?: (done: number, total: number) => void) => {
  const total = moments.length * jobNames().length;
  let done = 0;
  const step = () => onStep?.(++done, total);
  for (const at of moments) await runEveryJob(at, step);
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
