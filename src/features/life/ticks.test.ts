import { catchUpMoments, runTicks, tickJobs } from "./ticks";
import { registerJob, resetScheduler } from "./scheduler";

const HOUR = 3_600_000;
const TIMING = { everyMs: HOUR, firstMs: HOUR };

afterEach(resetScheduler);

test("time away becomes a moment every few hours, at most six, mid-stretch", () => {
  expect(catchUpMoments(0, HOUR)).toEqual([HOUR / 2]);
  expect(catchUpMoments(0, 8 * HOUR)).toEqual([2 * HOUR, 6 * HOUR]);
  expect(catchUpMoments(0, 72 * HOUR)).toHaveLength(6);
  expect(catchUpMoments(5, 5)).toEqual([]);
});

test("every registered job runs at every moment, one after another", async () => {
  const seen: string[] = [];
  const offA = registerJob("a", TIMING, async (at) => void seen.push(`a${at}`));
  const offB = registerJob("b", TIMING, (at) => void seen.push(`b${at}`));
  expect(tickJobs()).toEqual(["a", "b"]);
  const steps: number[] = [];
  await runTicks([1, 2], (done) => steps.push(done));
  expect(seen).toEqual(["a1", "b1", "a2", "b2"]);
  expect(steps).toEqual([1, 2, 3, 4]);
  offA();
  offB();
  expect(tickJobs()).toEqual([]);
});
