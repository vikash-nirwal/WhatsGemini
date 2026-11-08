import { registerJob } from "src/features/life/scheduler";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppDispatch } from "src/store/hooks";
import { firstTextCheck } from "src/features/character/engine/firstTextJob";

const CHECK_EVERY_MS = 20 * 60 * 1000;
const FIRST_CHECK_MS = 20 * 1000;

// They text first (#93): while the app is open, a character with the switch
// on whose 1:1 chat has gone quiet sends a short text into it (or a dream,
// #94). The job itself is in features/character/engine/firstTextJob.ts
// (#252); this puts it on the scheduler (#209), which also runs it for
// catch-up and Simulate a day, and tells it where you are, so the chat
// you're reading gets no toast.
const FirstTexter = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;

  useEffect(
    () => registerJob("first-text", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, (at) => dispatch(firstTextCheck({ navigate, path: () => path.current }, at))),
    [dispatch, navigate]
  );
  return null;
};

export default FirstTexter;
