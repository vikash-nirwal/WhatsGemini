import { registerJob } from "src/features/life/scheduler";
import { useEffect } from "react";
import { useAppDispatch } from "src/store/hooks";
import { profileCheck } from "src/features/character/engine/profileJob";

const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_MS = 25 * 1000;

// Profile changes (#125): while the app is open, a character with the
// switch on and a 1:1 chat with you changes their About line and now and
// then their photo. The job itself is in
// features/character/engine/profileJob.ts (#252); this puts it on the
// scheduler (#209), which also runs it for catch-up and Simulate a day.
const ProfileChanger = () => {
  const dispatch = useAppDispatch();
  useEffect(() => registerJob("profile", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, (at) => dispatch(profileCheck(at))), [dispatch]);
  return null;
};

export default ProfileChanger;
