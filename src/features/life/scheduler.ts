import { backgroundAllowed } from "../world/worldPrefs";

// One world scheduler (#209). Every background job used to keep its own
// timers and its own "busy" flag, so a dozen jobs could call the model at
// once and nothing saw the whole picture. Now each job registers here with
// how often it checks, and one heartbeat starts the ones that are due. Runs
// go through a single queue, one at a time, whether they come from the
// heartbeat, a catch-up after time away or Simulate a day.

export interface JobTiming {
  everyMs: number; // how often the job checks whether it has something to do
  firstMs: number; // its first check after it registers
}

type Run = (at?: number) => Promise<unknown> | unknown;

interface Job {
  name: string;
  timing: JobTiming;
  run: Run;
  nextAt: number;
}

// The longest the timer waits at once, so a clock change or a sleeping
// laptop never leaves jobs waiting long past their time.
const MAX_WAIT_MS = 60 * 1000;
const jobs = new Map<string, Job>();
const waiting = new Set<string>(); // heartbeat runs queued or under way
let chain: Promise<unknown> = Promise.resolve();
let heartbeat: number | undefined;

// The one queue. A failing job is logged and never stops the ones after it.
export const enqueue = (name: string, run: () => Promise<unknown> | unknown): Promise<void> => {
  const next = chain.then(async () => {
    try {
      await run();
    } catch (err) {
      console.warn(`Background job "${name}" failed (non-fatal):`, err);
    }
  });
  chain = next;
  return next;
};

// Starts every job whose check is due. Exported so tests can step the clock.
export const beat = (now = Date.now()) => {
  for (const job of Array.from(jobs.values())) {
    if (job.nextAt > now || waiting.has(job.name)) continue;
    job.nextAt = now + job.timing.everyMs;
    waiting.add(job.name);
    void enqueue(job.name, () => job.run()).finally(() => {
      waiting.delete(job.name);
      arm();
    });
  }
};

// One timer, set for the next check that's due: checks land when they're
// due, as each job's own timers did, and nothing wakes in between. A job
// still running is left out until it finishes (which arms again), so a
// slow one can't spin the timer.
const stopHeartbeat = () => {
  if (heartbeat === undefined) return;
  window.clearTimeout(heartbeat);
  heartbeat = undefined;
};

function arm() {
  stopHeartbeat();
  const next = Math.min(...Array.from(jobs.values()).filter((j) => !waiting.has(j.name)).map((j) => j.nextAt));
  if (!Number.isFinite(next)) return;
  heartbeat = window.setTimeout(() => {
    heartbeat = undefined;
    beat();
    arm();
  }, Math.min(MAX_WAIT_MS, Math.max(0, next - Date.now())));
}

const startHeartbeat = () => arm();

// Registers a job; the returned function takes it off again (a component
// that unmounts). Registering the same name again replaces it but keeps its
// place in time, so a remount doesn't bring its next check forward.
export const registerJob = (name: string, timing: JobTiming, run: Run) => {
  const before = jobs.get(name);
  const job: Job = { name, timing, run, nextAt: before?.nextAt ?? Date.now() + timing.firstMs };
  jobs.set(name, job);
  startHeartbeat();
  return () => {
    if (jobs.get(name) !== job) return;
    jobs.delete(name);
    if (!jobs.size) stopHeartbeat();
  };
};

export const jobNames = () => Array.from(jobs.keys());

// Runs every job once for the moment given (a catch-up moment, or undefined
// for "now"), through the same queue, reporting each one as it finishes.
export const runEveryJob = async (at: number | undefined, onDone?: (name: string) => void) => {
  for (const job of Array.from(jobs.values())) {
    await enqueue(job.name, () => job.run(at));
    onDone?.(job.name);
  }
};

// Taking turns between worlds. A job that serves one world per check used
// to take the first one in the list that was due, and world talk took one
// pair across every world, so a world with many people crowded out the
// rest. Each job now remembers when it last served each world and starts
// with the one it served longest ago; worlds that are in quiet hours or at
// their call cap are left out, so no prompt is built only to be refused.
const served = new Map<string, Map<string, number>>();
const keyOf = (worldId: number | null) => (worldId === null ? "mine" : String(worldId));

export const fairOrder = <T,>(job: string, items: T[], worldIdOf: (item: T) => number | null, now = Date.now()): T[] => {
  const last = served.get(job);
  return items
    .filter((item) => backgroundAllowed(worldIdOf(item), now))
    .map((item, i) => ({ item, i, at: last?.get(keyOf(worldIdOf(item))) ?? -Infinity }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.item);
};

export const markServed = (job: string, worldId: number | null, at = Date.now()) => {
  const last = served.get(job) || new Map<string, number>();
  last.set(keyOf(worldId), at);
  served.set(job, last);
};

// For tests: forget every job, turn and queued run.
export const resetScheduler = () => {
  jobs.clear();
  waiting.clear();
  served.clear();
  chain = Promise.resolve();
  stopHeartbeat();
};
