import { catchUpTime } from "src/features/life/away";
import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { changeChannels, loadChannels } from "src/features/channelSlice";
import { addChannelPost, buildCharacterChannelPrompt, buildWorldChannelPrompt, channelPostDue, cleanChannelPost, newChannelPostId } from "src/features/channels/channels";
import { dayLogText } from "src/features/character/dayLog";
import { concernsLine } from "src/features/character/preoccupations";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 20 * 1000;

// Channels (#127): while the app is open, a followed channel that's due
// posts once (one channel per check) on the helper model. A channel whose
// character or world is gone is skipped.
const ChannelPoster = () => {
  const dispatch = useAppDispatch();
  const channels = useAppSelector((state) => state.channels.channels);
  const characters = useAppSelector((state) => state.character.characters);
  const worlds = useAppSelector((state) => state.world.worlds);
  const latest = useRef({ channels, characters, worlds });
  latest.current = { channels, characters, worlds };
  const busy = useRef(false);

  useEffect(() => {
    dispatch(loadChannels());
  }, [dispatch]);

  useEffect(() => {
    // `at`: a catch-up turn back in your absence (#130), stamped with it.
    const check = async (at?: number) => {
      if (busy.current) return;
      const now = at ?? Date.now();
      const { channels, characters, worlds } = latest.current;
      const due = channels.find((c) => channelPostDue(c, now) && (c.kind === "character" ? characters.some((x) => x.id === c.refId) : worlds.some((w) => w.id === c.refId)));
      if (!due) return;
      busy.current = true;
      try {
        const recent = due.posts.slice(-4).map((p) => p.text);
        const channelName = (due.kind === "character" ? characters.find((x) => x.id === due.refId)?.name : worlds.find((w) => w.id === due.refId)?.name) || "A channel";
        let instruction: string;
        if (due.kind === "character") {
          const character = characters.find((x) => x.id === due.refId)!;
          instruction = buildCharacterChannelPrompt(character, recent, { dayLog: dayLogText(character, now), concerns: concernsLine(character.concerns), now });
        } else {
          const world = worlds.find((w) => w.id === due.refId)!;
          instruction = buildWorldChannelPrompt(world, (world.map?.pins || []).map((p) => p.name), recent);
        }
        const text = cleanChannelPost(await dispatch(generateAssistText({ instruction, background: true, activity: { at: now, kind: "channel", text: `${channelName} posted to its channel`, characterId: due.kind === "character" ? due.refId : undefined, name: channelName } })).unwrap());
        // Recorded even when nothing usable came back, so it isn't retried every check.
        await dispatch(changeChannels((list) => list.map((c) => (c.id === due.id ? { ...c, lastPostAt: now, posts: text ? addChannelPost(c.posts, { id: newChannelPostId(), text, at: now }) : c.posts } : c))));
      } catch (err) {
        console.warn("Channel post failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    // The catch-up turn is claimed when the timer fires, not at mount (a
    // remount would otherwise lose it).
    const first = window.setTimeout(() => check(catchUpTime("channel")), FIRST_CHECK_MS);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch]);

  return null;
};

export default ChannelPoster;
