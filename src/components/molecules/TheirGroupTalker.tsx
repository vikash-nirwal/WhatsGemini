import { useEffect } from "react";
import { useAppDispatch } from "src/store/hooks";
import { registerJob } from "src/features/life/scheduler";
import { theirGroupCheck } from "src/features/chat/engine/theirGroupJob";

const CHECK_EVERY_MS = 20 * 60 * 1000;
const FIRST_CHECK_MS = 45 * 1000;

// Groups of theirs (#202): while the app is open, one that's due talks.
// The job itself is in features/chat/engine/theirGroupJob.ts (#252); this
// puts it on the scheduler (#209), which also runs it for catch-up and
// Simulate a day.
const TheirGroupTalker = () => {
  const dispatch = useAppDispatch();
  useEffect(() => registerJob("their-groups", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, (at) => dispatch(theirGroupCheck(at))), [dispatch]);
  return null;
};

export default TheirGroupTalker;
