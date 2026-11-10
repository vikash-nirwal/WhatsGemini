import { registerJob } from "src/features/life/scheduler";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppDispatch } from "src/store/hooks";
import { reminderCheck } from "src/features/tools/reminderJob";

// A timer of a minute or two should land near its time, and a check with
// nothing due does no work, so this one runs often.
const CHECK_EVERY_MS = 15 * 1000;
const FIRST_CHECK_MS = 5 * 1000;

// Reminders and timers (#268): while the app is open, a reminder a character
// set that has come due is sent as a text from them. The job is in
// features/tools/reminderJob.ts; this puts it on the scheduler (#209). The
// moment a catch-up or Simulate a day passes is ignored: a reminder is about
// the real clock.
const ReminderRunner = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;

  useEffect(
    () => registerJob("reminders", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, () => dispatch(reminderCheck({ navigate, path: () => path.current }))),
    [dispatch, navigate]
  );
  return null;
};

export default ReminderRunner;
