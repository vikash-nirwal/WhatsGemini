import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateWorld } from "src/features/worldSlice";
import { buildEventIdeaPrompt, EVENT_GAP_MS, eventDue, parseEvent } from "src/features/world/worldEvents";
import { startWorldEvent } from "src/features/world/startEvent";
import { lifeScaled } from "src/features/life/lifeDial";
import { useLivingCharacters } from "src/hooks/useWorld";
import { updateCharacter } from "src/features/characterSlice";
import { addLifeEvent, buildLifeEventPrompt, cleanLifeEvent, LIFE_GAP_MS, lifeEventDue, NEWCOMER_GAP_MS, newcomerDue, pickLifeSubject } from "src/features/world/worldLife";
import { buildCastSuggestionsPrompt, parseCastSuggestions } from "src/features/world/worldAssist";
import { logToTimeline } from "src/features/world/timeline";
import { toast } from "sonner";

const CHECK_EVERY_MS = 2 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;

// World events (#162): while the app is open, a world with people in it
// that's been quiet for a few days starts an event of its own, one world
// per check, on the helper model. The same check moves lives on (#164):
// something happens in someone's life, or a newcomer turns up for you to
// welcome. One thing per check.
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
      if (!world) {
        await moveLivesOn(now);
        return;
      }
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
    const moveLivesOn = async (now: number) => {
      const { worlds, characters } = latest.current;
      const castOf = (id: number) => characters.filter((c) => c.worldId === id);
      const living = worlds.find((w) => castOf(w.id).length > 0 && lifeEventDue(w, now, lifeScaled(LIFE_GAP_MS)));
      const arriving = living ? undefined : worlds.find((w) => newcomerDue(w, castOf(w.id).length, now, lifeScaled(NEWCOMER_GAP_MS)));
      const world = living || arriving;
      if (!world) return;
      busy.current = true;
      try {
        const cast = castOf(world.id);
        if (living) {
          await dispatch(updateWorld({ ...world, lastLifeAt: now }));
          const who = pickLifeSubject(cast, now);
          if (!who) return;
          const people = (who.ties || []).map((t) => characters.find((c) => c.id === t.withId)?.name).filter((n): n is string => Boolean(n));
          const text = cleanLifeEvent(await dispatch(generateAssistText({ instruction: buildLifeEventPrompt(who, world, people), background: true, activity: { at: now, kind: "event", text: `Something happened in ${who.name}'s life`, characterId: who.id, name: who.name } })).unwrap());
          const fresh = latest.current.characters.find((c) => c.id === who.id);
          if (!text || !fresh) return;
          await dispatch(updateCharacter(addLifeEvent(fresh, text, now)));
          void logToTimeline(world.id, { kind: "event", text, characterIds: [who.id], at: now }, world.storyTime);
        } else {
          await dispatch(updateWorld({ ...world, lastNewcomerAt: now }));
          const reply = await dispatch(generateAssistText({ instruction: buildCastSuggestionsPrompt(world, cast.map((c) => ({ name: c.name, description: c.description })), [], 1), background: true, activity: { at: now, kind: "event", text: `Someone new came to ${world.name}`, name: world.name } })).unwrap();
          const sg = parseCastSuggestions(reply, cast.map((c) => ({ name: c.name, description: c.description })))[0];
          const fresh = latest.current.worlds.find((w) => w.id === world.id);
          if (!sg || !fresh) return;
          await dispatch(updateWorld({ ...fresh, newcomer: { ...sg, at: now } }));
          toast(`Someone new in ${world.name}`, { description: `${sg.name}${sg.tieWith ? `, ${sg.tieWith}'s ${sg.tie}` : ""}. Welcome them on the Worlds page.` });
        }
      } catch (err) {
        console.warn("World life failed (non-fatal):", err);
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
