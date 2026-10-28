import { configureStore } from "@reduxjs/toolkit";
import { toast } from "sonner";
import tasksReducer, { outputAdded, outputsSet, runningTask, runTask } from "./tasksSlice";

jest.mock("sonner", () => ({ toast: { loading: jest.fn(), success: jest.fn(), error: jest.fn(), dismiss: jest.fn() } }));

const makeStore = () => configureStore({ reducer: { tasks: tasksReducer } });

describe("background tasks", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is running while its work runs, with progress, and says when it's done", async () => {
    const store = makeStore();
    let finish = (_: number) => {};
    const run = store.dispatch(runTask({ kind: "announce", key: "3", label: "Announcing", path: "/worlds", done: (n: number) => ({ title: `${n} heard it` }) }, (report) => {
      report(40);
      return new Promise<number>((resolve) => { finish = resolve; });
    }) as any) as Promise<number>;
    expect(runningTask(store.getState(), "announce", "3")).toMatchObject({ label: "Announcing", progress: 40 });
    expect(runningTask(store.getState(), "announce", "4")).toBeUndefined();
    expect(toast.loading).toHaveBeenLastCalledWith("Announcing... 40%", expect.anything());
    finish(2);
    await expect(run).resolves.toBe(2);
    expect(store.getState().tasks.running).toEqual([]);
    expect(toast.success).toHaveBeenCalledWith("2 heard it", expect.objectContaining({ action: expect.objectContaining({ label: "View" }) }));
  });

  it("says when it fails, ends, and passes the failure on", async () => {
    const store = makeStore();
    await expect(store.dispatch(runTask({ kind: "x", key: "1", label: "Trying", failed: "It didn't work." }, async () => { throw new Error("no key"); }) as any)).rejects.toThrow("no key");
    expect(toast.error).toHaveBeenCalledWith("It didn't work.", expect.objectContaining({ description: "no key" }));
    expect(store.getState().tasks.running).toEqual([]);
  });

  it("stays quiet when asked, and keeps what tasks made by key", async () => {
    const store = makeStore();
    await store.dispatch(runTask({ kind: "x", key: "1", label: "Thinking", quiet: true }, async () => 1) as any);
    expect(toast.loading).not.toHaveBeenCalled();
    store.dispatch(outputAdded({ key: "k", item: "a" }));
    store.dispatch(outputAdded({ key: "k", item: "b", first: true }));
    expect(store.getState().tasks.outputs.k).toEqual(["b", "a"]);
    store.dispatch(outputsSet({ key: "k", items: [] }));
    expect(store.getState().tasks.outputs.k).toBeUndefined();
  });
});
