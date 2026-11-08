import { useEffect } from "react";
import { registerJob } from "src/features/life/scheduler";
import { useAppDispatch } from "src/store/hooks";
import { rumorCheck } from "src/features/character/engine/rumorJob";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 35 * 1000;

// Rumors (#98): while the app is open, now and then something from the 1:1
// chat of a character who "talks" reaches another character, a little
// wrong. The job itself is in features/character/engine/rumorJob.ts (#252);
// this puts it on the scheduler (#209), which also runs it for catch-up and
// Simulate a day.
const RumorMill = () => {
  const dispatch = useAppDispatch();
  useEffect(() => registerJob("rumors", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, () => dispatch(rumorCheck())), [dispatch]);
  return null;
};

export default RumorMill;
