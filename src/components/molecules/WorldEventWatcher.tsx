import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateWorld } from "src/features/worldSlice";
import { buildEventIdeaPrompt, EVENT_GAP_MS, eventDue, parseEvent } from "src/features/world/worldEvents";
import { startWorldEvent } from "src/features/world/startEvent";
import { lifeScaled } from "src/features/life/lifeDial";
import { useLivingCharacters } from "src/hooks/useWorld";

const CHECK_EVERY_MS = 2 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;

// World events (#162): while the app is open, a world with people in it
// that's been quiet for a few days starts an event of its own, one world
// per check, on the helper model.
const WorldEventWatcher = () => {
  const dispatch = useAppDispatch();
  const worlds = useAppSelector((state) => state.world.worlds);
  const characters = useLivingCharacters();
  const latest = useRef({ worlds, characters });
  latest.current = { worlds, characters };
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const { worlds, characters } = latest.current;
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const world = worlds.find((w) => castOf(w.id).length >= 2 && eventDue(w, now, lifeScaled(EVENT_GAP_MS)));
      if (!world) return;
      busy.current = true;
      try {
        // The check is recorded first, so a failed one waits a whole gap.
        await dispatch(updateWorld({ ...world, lastEventCheckAt: now }));
        const reply = await dispatch(generateAssistText({
          instruction: buildEventIdeaPrompt(world, castOf(world.id).map((c) => c.name), world.events || []),
          background: true,
          activity: { at: now, kind: "event", text: `Something happened in ${world.name}`, name: world.name },
        })).unwrap();
        const event = parseEvent(reply, now);
        const fresh = latest.current.worlds.find((w) => w.id === world.id);
        if (event && fresh) await dispatch(startWorldEvent(fresh, event));
      } catch (err) {
        console.warn("World event failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch]);

  return null;
};

export default WorldEventWatcher;
