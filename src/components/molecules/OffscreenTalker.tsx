import { useEffect } from "react";
import { registerJob } from "src/features/life/scheduler";
import { useAppDispatch } from "src/store/hooks";
import { offscreenTalkCheck } from "src/features/chat/engine/offscreenTalkJob";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 20 * 1000;

// Characters talk while you're away (#58): while the app is open, a group
// chat with this switched on gets a short conversation between two of its
// members once you've been gone a while. The job itself is in
// features/chat/engine/offscreenTalkJob.ts (#252); this puts it on the
// scheduler (#209), which also runs it for catch-up and Simulate a day.
const OffscreenTalker = () => {
  const dispatch = useAppDispatch();
  useEffect(() => registerJob("group-talk", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, () => dispatch(offscreenTalkCheck())), [dispatch]);
  return null;
};

export default OffscreenTalker;
