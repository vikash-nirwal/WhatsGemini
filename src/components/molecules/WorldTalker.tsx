import { useEffect } from "react";
import { useAppDispatch } from "src/store/hooks";
import { registerJob } from "src/features/life/scheduler";
import { worldTalkTurn } from "src/features/world/engine/worldTalkTurn";

const CHECK_EVERY_MS = 45 * 60 * 1000;
const FIRST_CHECK_MS = 35 * 1000;

// Life inside a world (#145): while the app is open, two characters who
// know each other text on their own now and then. The turn itself is in
// features/world/engine/worldTalkTurn.ts (#209); this puts it on the
// scheduler, which also runs it for catch-up and Simulate a day.
const WorldTalker = () => {
  const dispatch = useAppDispatch();
  useEffect(() => registerJob("world-talk", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, (at) => dispatch(worldTalkTurn(at ?? Date.now()))), [dispatch]);
  return null;
};

export default WorldTalker;
