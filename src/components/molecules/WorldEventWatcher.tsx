import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { loadTimeline } from "src/features/world/timeline";
import { registerJob } from "src/features/life/scheduler";
import { worldLifeCheck } from "src/features/world/engine/worldJobs";

// Every 20 minutes, each feature on its own gap (#174): one shared turn
// every two hours left a world with everything on doing one thing a visit.
// The gaps and the life dial keep the number of calls where it was.
const CHECK_EVERY_MS = 20 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;

// A world's own life, while the app is open, on the helper model. The jobs
// themselves are in features/world/engine/worldJobs.ts (#209); this puts
// them on the scheduler, which also runs them for catch-up and Simulate a
// day.
const WorldEventWatcher = () => {
  const dispatch = useAppDispatch();
  const worlds = useAppSelector((state) => state.world.worlds);

  // Background prompts recall the history from the timeline cache (#179).
  const worldIds = worlds.map((w) => w.id).join(",");
  useEffect(() => {
    for (const id of worldIds ? worldIds.split(",").map(Number) : []) void loadTimeline(id);
  }, [worldIds]);

  useEffect(() => registerJob("world-life", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, (at) => dispatch(worldLifeCheck(at ?? Date.now()))), [dispatch]);

  return null;
};

export default WorldEventWatcher;
