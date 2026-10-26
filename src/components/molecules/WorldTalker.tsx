import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateCharacter } from "src/features/characterSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { parseOffscreenTalk } from "src/features/chat/offscreenTalk";
import { addWorldTalk, buildWorldTalkPrompt, parseTieChange, pickTalkTopic, tieMayChange, pickWorldTalk, recencyOf, talksBetween, UserKnowledge, WORLD_TALK_GAP_MS } from "src/features/world/worldTalk";
import { channelId } from "src/features/channels/channels";
import { logToTimeline } from "src/features/world/timeline";
import { activeEvents } from "src/features/world/worldEvents";
import { withTie } from "src/features/character/ties";
import { toast } from "sonner";
import { factsAboutUser } from "src/features/character/intimacy";
import { featureOn, talkLengthFor } from "src/features/world/worldPrefs";
import { worldOf } from "src/features/world/currentWorld";
import { awakeAt } from "src/features/character/firstTexts";
import { lifeScaled } from "src/features/life/lifeDial";
import { catchUpTime } from "src/features/life/away";
import { useLivingCharacters } from "src/hooks/useWorld";

const CHECK_EVERY_MS = 45 * 60 * 1000;
const FIRST_CHECK_MS = 35 * 1000;

// Life inside a world (#145): while the app is open, two characters who
// know each other text on their own now and then, one pair per check, on
// the helper model. You only see it through Peek.
const WorldTalker = () => {
  const dispatch = useAppDispatch();
  const characters = useLivingCharacters();
  const worlds = useAppSelector((state) => state.world.worlds);
  const persona = useAppSelector(selectActivePersona);
  const chats = useAppSelector((state) => state.chat.chats);
  const channels = useAppSelector((state) => state.channels.channels);
  const latest = useRef({ characters, worlds, persona, chats, channels });
  latest.current = { characters, worlds, persona, chats, channels };
  const busy = useRef(false);

  useEffect(() => {
    // `at`: a catch-up turn back in your absence (#130), stamped with it.
    const check = async (at?: number) => {
      if (busy.current) return;
      const now = at ?? Date.now();
      const { characters, worlds, persona, chats, channels } = latest.current;
      const pair = pickWorldTalk(characters, worlds, now, { gapMs: lifeScaled(WORLD_TALK_GAP_MS), awake: (c) => awakeAt(c, now) });
      if (!pair) return;
      const [a, b] = pair;
      const worldId = worldOf(a, worlds);
      busy.current = true;
      try {
        const previous = talksBetween(characters, a.id, b.id).slice(-1)[0];
        const maxLines = talkLengthFor(worldId);
        // A topic each time (#159), now and then the user - with what each
        // of them actually knows about them.
        // A world event going on (#162) is the news before the channel's last post.
        const event = featureOn(worldId, "events") ? activeEvents(worlds.find((w) => w.id === worldId), now)[0] : undefined;
        const news = event ? `${event.title}: ${event.text}` : worldId ? channels.find((c) => c.id === channelId("world", worldId))?.posts.slice(-1)[0]?.text : undefined;
        const topic = pickTalkTopic({ hasTie: Boolean(a.ties?.some((t) => t.withId === b.id)), hasNews: Boolean(news), hasPrevious: Boolean(previous?.lines.length) });
        const knowledge = (c: typeof a): UserKnowledge => {
          const own = chats.filter((ch) => ch.characterIds?.length === 1 && ch.characterIds[0] === c.id);
          const lastAt = Math.max(0, ...own.map((ch) => ch.content?.[ch.content.length - 1]?.timestamp || 0));
          return { relationship: c.relationship, lastTalked: recencyOf(lastAt || undefined, now), facts: factsAboutUser([...(c.pinnedMemory || []), ...(c.memory || [])], c.memoryCategories) };
        };
        const askTie = featureOn(worldId, "drift") && tieMayChange(topic);
        const reply = await dispatch(generateAssistText({
          instruction: buildWorldTalkPrompt(a, b, { world: worlds.find((w) => w.id === worldId), userName: persona?.name?.trim() || "the user", maxLines, previous, topic, news, askTie, knows: { [a.id]: knowledge(a), [b.id]: knowledge(b) } }),
          background: true,
          activity: { at: now, kind: "talk", text: `${a.name} and ${b.name} texted`, characterId: a.id, name: a.name },
        })).unwrap();
        const lines = parseOffscreenTalk(reply, pair, maxLines);
        // Saved even when empty, so a failed attempt waits for the next gap.
        const holder = latest.current.characters.find((c) => c.id === a.id) || a;
        await dispatch(updateCharacter(addWorldTalk(holder, { id: `wt-${now.toString(36)}`, withId: b.id, at: now, lines })));
        // When they talked about you, the world's timeline notes it (#161).
        const w = worlds.find((x) => x.id === worldId);
        if (topic === "user" && lines.length) {
          void logToTimeline(worldId, { kind: "talk", text: `${a.name} and ${b.name} talked about you`, characterIds: [a.id, b.id], at: now }, w?.storyTime);
        }
        // Relationships that drift (#163): the talk changed how they stand.
        const change = askTie && lines.length ? parseTieChange(reply) : undefined;
        const freshA = latest.current.characters.find((c) => c.id === a.id);
        const freshB = latest.current.characters.find((c) => c.id === b.id);
        const before = freshA?.ties?.find((t) => t.withId === b.id)?.tie;
        if (change && freshA && freshB && change.bToA.replace(/^your\s+/i, "").toLowerCase() !== (before || "").replace(/^your\s+/i, "").toLowerCase()) {
          const [na, nb] = withTie(freshA, freshB, change.bToA, change.aToB);
          await dispatch(updateCharacter(na));
          await dispatch(updateCharacter(nb));
          const what = `${b.name} is now ${a.name}'s ${change.bToA.replace(/^your\s+/i, "")}${before ? ` (was ${before.replace(/^your\s+/i, "")})` : ""}`;
          void logToTimeline(worldId, { kind: "tie", text: what, characterIds: [a.id, b.id], at: now }, w?.storyTime);
          toast(`${a.name} and ${b.name}`, { description: what });
        }
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
