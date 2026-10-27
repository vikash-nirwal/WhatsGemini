import { useEffect } from "react";
import { awaySession, wasAway } from "src/features/life/away";
import { catchUpMoments, runTicks } from "src/features/life/ticks";
import { catchUpWorlds } from "src/features/world/engine/catchUpJob";
import { useAppDispatch } from "src/store/hooks";

// Before any job's own first check (the earliest is 8 s in), so what's due
// lands inside the absence rather than now.
const START_AFTER_MS = 5 * 1000;

// Catch-up for time away (#193): back after an absence, every background
// job gets a turn at moments spread across it - one every few hours, at
// most six - so a long absence brings more than a short one. Each job's own
// gaps still decide whether anything happens. Then worlds on world turns
// tell you what you missed (#213).
const LifeTicker = () => {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!wasAway()) return;
    const { lastSeen, openedAt } = awaySession();
    const timer = window.setTimeout(() => void runTicks(catchUpMoments(lastSeen, openedAt)).then(() => dispatch(catchUpWorlds(lastSeen, openedAt))), START_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch]);
  return null;
};

export default LifeTicker;
