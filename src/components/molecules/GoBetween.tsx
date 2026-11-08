import { useEffect } from "react";
import { registerJob } from "src/features/life/scheduler";
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "src/store/hooks";
import { goBetweenCheck } from "src/features/chat/engine/goBetweenJob";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 40 * 1000;

// The go-between (#133): now and then, someone you blocked asks a friend
// you share to put in a word, and that friend brings it up in your chat
// with them. The job itself is in features/chat/engine/goBetweenJob.ts
// (#252); this puts it on the scheduler (#209), which also runs it for
// catch-up and Simulate a day, and lends it the router for its toast.
const GoBetween = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  useEffect(() => registerJob("go-between", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, () => dispatch(goBetweenCheck({ navigate }))), [dispatch, navigate]);
  return null;
};

export default GoBetween;
