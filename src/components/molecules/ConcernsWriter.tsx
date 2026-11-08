import { useEffect } from "react";
import { registerJob } from "src/features/life/scheduler";
import { useAppDispatch } from "src/store/hooks";
import { concernsCheck } from "src/features/character/engine/concernsJob";

const CHECK_EVERY_MS = 60 * 60 * 1000;
// After the day log (8 s), so this week's list can lean on today's account.
const FIRST_CHECK_MS = 12 * 1000;

// Their own preoccupations (#110): while the app is open, once a week each
// character with the switch on gets this week's list. The job itself is in
// features/character/engine/concernsJob.ts (#252); this puts it on the
// scheduler (#209), which also runs it for catch-up and Simulate a day.
const ConcernsWriter = () => {
  const dispatch = useAppDispatch();
  useEffect(() => registerJob("concerns", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, () => dispatch(concernsCheck())), [dispatch]);
  return null;
};

export default ConcernsWriter;
