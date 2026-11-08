import { useEffect } from "react";
import { registerJob } from "src/features/life/scheduler";
import { useAppDispatch } from "src/store/hooks";
import { letterCheck } from "src/features/character/engine/letterJob";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 25 * 1000;

// Letters (#61): while the app is open, a character with letters on whose
// 1:1 chat has been quiet for a few days writes you one. The job itself is
// in features/character/engine/letterJob.ts (#252); this puts it on the
// scheduler (#209), which also runs it for catch-up and Simulate a day.
const LetterWriter = () => {
  const dispatch = useAppDispatch();
  useEffect(() => registerJob("letters", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, () => dispatch(letterCheck())), [dispatch]);
  return null;
};

export default LetterWriter;
