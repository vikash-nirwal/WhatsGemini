import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateCharacter } from "src/features/characterSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { parseOffscreenTalk } from "src/features/chat/offscreenTalk";
import { addWorldTalk, buildWorldTalkPrompt, pickWorldTalk, talksBetween, WORLD_TALK_GAP_MS } from "src/features/world/worldTalk";
import { talkLengthFor } from "src/features/world/worldPrefs";
import { worldOf } from "src/features/world/currentWorld";
import { awakeAt } from "src/features/character/firstTexts";
import { lifeScaled } from "src/features/life/lifeDial";
import { catchUpTime } from "src/features/life/away";

const CHECK_EVERY_MS = 45 * 60 * 1000;
const FIRST_CHECK_MS = 35 * 1000;

// Life inside a world (#145): while the app is open, two characters who
// know each other text on their own now and then, one pair per check, on
// the helper model. You only see it through Peek.
const WorldTalker = () => {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.character.characters);
  const worlds = useAppSelector((state) => state.world.worlds);
  const persona = useAppSelector(selectActivePersona);
  const latest = useRef({ characters, worlds, persona });
  latest.current = { characters, worlds, persona };
  const busy = useRef(false);

  useEffect(() => {
    // `at`: a catch-up turn back in your absence (#130), stamped with it.
    const check = async (at?: number) => {
      if (busy.current) return;
      const now = at ?? Date.now();
      const { characters, worlds, persona } = latest.current;
      const pair = pickWorldTalk(characters, worlds, now, { gapMs: lifeScaled(WORLD_TALK_GAP_MS), awake: (c) => awakeAt(c, now) });
      if (!pair) return;
      const [a, b] = pair;
      const worldId = worldOf(a, worlds);
      busy.current = true;
      try {
        const previous = talksBetween(characters, a.id, b.id).slice(-1)[0];
        const maxLines = talkLengthFor(worldId);
        const reply = await dispatch(generateAssistText({
          instruction: buildWorldTalkPrompt(a, b, { world: worlds.find((w) => w.id === worldId), userName: persona?.name?.trim() || "the user", maxLines, previous }),
          background: true,
          activity: { at: now, kind: "talk", text: `${a.name} and ${b.name} texted`, characterId: a.id, name: a.name },
        })).unwrap();
        const lines = parseOffscreenTalk(reply, pair, maxLines);
        // Saved even when empty, so a failed attempt waits for the next gap.
        const holder = latest.current.characters.find((c) => c.id === a.id) || a;
        await dispatch(updateCharacter(addWorldTalk(holder, { id: `wt-${now.toString(36)}`, withId: b.id, at: now, lines })));
      } catch (err) {
        console.warn("World talk failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    // The catch-up turn is claimed when the timer fires, not at mount.
    const first = window.setTimeout(() => check(catchUpTime("world-talk")), FIRST_CHECK_MS);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch]);

  return null;
};

export default WorldTalker;
