import { beat, enqueue, fairOrder, markServed, registerJob, resetScheduler } from "./scheduler";
import { saveWorldPrefs } from "../world/worldPrefs";

const MIN = 60_000;

afterEach(() => {
  resetScheduler();
  localStorage.clear();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

test("a job runs once its first check is due, then on its own gap", async () => {
  const now = Date.now();
  let runs = 0;
  registerJob("a", { everyMs: 20 * MIN, firstMs: MIN }, () => void runs++);
  beat(now);
  await flush();
  expect(runs).toBe(0);
  beat(now + MIN);
  await flush();
  expect(runs).toBe(1);
  beat(now + 10 * MIN);
  await flush();
  expect(runs).toBe(1);
  beat(now + 21 * MIN);
  await flush();
  expect(runs).toBe(2);
});

test("only one job runs at a time, and a failing one doesn't stop the rest", async () => {
  const order: string[] = [];
  let release!: () => void;
  const slow = new Promise<void>((r) => (release = r));
  void enqueue("slow", async () => {
    order.push("slow start");
    await slow;
    order.push("slow end");
  });
  void enqueue("broken", () => {
    throw new Error("no");
  });
  const last = enqueue("next", () => void order.push("next"));
  await flush();
  expect(order).toEqual(["slow start"]);
  release();
  await last;
  expect(order).toEqual(["slow start", "slow end", "next"]);
});

test("a job still running isn't started again by the next beat", async () => {
  const now = Date.now();
  let runs = 0;
  let release!: () => void;
  registerJob("a", { everyMs: MIN, firstMs: 0 }, async () => {
    runs++;
    await new Promise<void>((r) => (release = r));
  });
  beat(now);
  await flush();
  beat(now + 2 * MIN);
  await flush();
  expect(runs).toBe(1);
  release();
});

test("registering again keeps the job's place in time", () => {
  const now = Date.now();
  let runs = 0;
  const off = registerJob("a", { everyMs: MIN, firstMs: 10 * MIN }, () => void runs++);
  off();
  registerJob("a", { everyMs: MIN, firstMs: 10 * MIN }, () => void runs++);
  beat(now + MIN);
  expect(runs).toBe(0);
});

test("worlds take turns: the one served longest ago goes first", () => {
  const worlds = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const ids = () => fairOrder("events", worlds, (w) => w.id).map((w) => w.id);
  expect(ids()).toEqual([1, 2, 3]);
  markServed("events", 1, 100);
  expect(ids()).toEqual([2, 3, 1]);
  markServed("events", 2, 200);
  markServed("events", 3, 300);
  expect(ids()).toEqual([1, 2, 3]);
  // Turns are kept per job.
  expect(fairOrder("talk", worlds, (w) => w.id).map((w) => w.id)).toEqual([1, 2, 3]);
});

test("worlds in quiet hours or at their call cap are left out", () => {
  const h = new Date().getHours();
  saveWorldPrefs(2, { quietHours: [h, (h + 1) % 24] });
  saveWorldPrefs(null, { callCap: 1 });
  localStorage.setItem(`world_calls_mine_${new Date().toISOString().slice(0, 10)}`, "1");
  expect(fairOrder("x", [{ id: 1 }, { id: 2 }, { id: null }], (w) => w.id).map((w) => w.id)).toEqual([1]);
});
