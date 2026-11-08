import { registerJob } from "src/features/life/scheduler";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "src/store/hooks";
import { statusCheck } from "src/features/character/engine/statusJob";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 15 * 1000;

// Status updates (#8): while the app is open, now and then a character with
// statuses on posts one, and those who know them react in the feed (#85).
// The job itself is in features/character/engine/statusJob.ts (#252); this
// puts it on the scheduler (#209), which also runs it for catch-up and
// Simulate a day, and lends it the router for its toast.
const StatusPoster = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  useEffect(() => registerJob("status", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, (at) => dispatch(statusCheck({ navigate }, at))), [dispatch, navigate]);
  return null;
};

export default StatusPoster;
