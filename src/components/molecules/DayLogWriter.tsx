import { useEffect } from "react";
import { registerJob } from "src/features/life/scheduler";
import { useAppDispatch } from "src/store/hooks";
import { dayLogCheck } from "src/features/character/engine/dayLogJob";

const CHECK_EVERY_MS = 20 * 60 * 1000;
// Before the status poster (15 s) and the first texter (20 s), so their first
// check already finds today's account.
const FIRST_CHECK_MS = 8 * 1000;

// One consistent day (#107): while the app is open, once a day each character
// with the switch on gets today's account written. The job itself is in
// features/character/engine/dayLogJob.ts (#252); this puts it on the
// scheduler (#209), which also runs it for catch-up and Simulate a day.
const DayLogWriter = () => {
  const dispatch = useAppDispatch();
  useEffect(() => registerJob("day-log", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, () => dispatch(dayLogCheck())), [dispatch]);
  return null;
};

export default DayLogWriter;
