import { registerJob } from "src/features/life/scheduler";
import { useEffect } from "react";
import { useAppDispatch } from "src/store/hooks";
import { loadChannels } from "src/features/channelSlice";
import { channelCheck } from "src/features/channels/engine/channelJob";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 20 * 1000;

// Channels (#127): while the app is open, a followed channel that's due
// posts once on the helper model. The job itself is in
// features/channels/engine/channelJob.ts (#252); this loads the channels
// and puts the job on the scheduler (#209), which also runs it for catch-up
// and Simulate a day.
const ChannelPoster = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(loadChannels());
  }, [dispatch]);

  useEffect(() => registerJob("channel", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, (at) => dispatch(channelCheck(at))), [dispatch]);

  return null;
};

export default ChannelPoster;
