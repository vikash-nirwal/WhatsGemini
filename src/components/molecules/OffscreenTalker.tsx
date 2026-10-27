import { useEffect, useRef } from "react";
import { registerTick } from "src/features/life/ticks";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateChatOptions } from "src/features/chatSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { addTalk, buildOffscreenTalkPrompt, parseOffscreenTalk, pickPair, talkDue } from "src/features/chat/offscreenTalk";
import { formatTranscript } from "src/features/ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "src/features/ai/utils/transcript";
import { Character } from "src/types";
import { useLivingCharacters, useLivingChats } from "src/hooks/useWorld";
import { worldOf } from "src/features/world/currentWorld";
import { editTimeline, loadTimeline, logToTimeline } from "src/features/world/timeline";
import { applyShared, buildShareSection, parseNewFact, parseShared } from "src/features/world/knowledge";
import { buildSceneNow } from "src/features/world/sceneNow";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 20 * 1000;

// Characters talk while you're away (#58): while the app is open, a group
// chat with this switched on gets a short conversation between two of its
// members once you've been gone a while, at most one per check, on the
// cheaper helper model.
const OffscreenTalker = () => {
  const dispatch = useAppDispatch();
  const chats = useLivingChats();
  const characters = useLivingCharacters();
  const persona = useAppSelector(selectActivePersona);
  const worlds = useAppSelector((state) => state.world.worlds);
  const latest = useRef({ chats, characters, persona, worlds });
  latest.current = { chats, characters, persona, worlds };
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const { chats, characters, persona, worlds } = latest.current;
      const chat = chats.find((c) => talkDue(c, now));
      if (!chat?.id) return;
      const members = (chat.characterIds || []).map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
      const pair = pickPair(members, chat.roomRelationships);
      if (!pair) return;
      busy.current = true;
      try {
        const userName = persona?.name?.trim() || "the user";
        const namesById = Object.fromEntries(members.map((m) => [m.id, m.name]));
        const recent = trimToLatestSummary(chat.content || []).slice(-12);
        const feelings = (chat.roomRelationships || [])
          .filter((r) => r.note.trim() && pair.some((p) => p.id === r.fromId) && pair.some((p) => p.id === r.toId))
          .map((r) => `${namesById[r.fromId]} about ${namesById[r.toId]}: ${r.note.trim()}`);
        const worldId = worldOf(pair[0], worlds);
        const world = worlds.find((w) => w.id === worldId);
        const share = buildShareSection(pair, await loadTimeline(worldId), now, characters);
        const reply = await dispatch(generateAssistText({
          instruction: buildOffscreenTalkPrompt(pair[0], pair[1], userName, feelings, formatTranscript(recent, { userName, speakerNames: namesById }), chat.scenario, { sceneNow: buildSceneNow(world, pair, now), share }),
          background: true,
          activity: { kind: "talk", text: `${pair[0].name} and ${pair[1].name} talked`, characterId: pair[0].id, name: pair[0].name },
        })).unwrap();
        const lines = parseOffscreenTalk(reply, pair);
        // Hearsay (#206): what was passed on, and anything new about them.
        const told = lines.length ? parseShared(reply) : [];
        if (told.length) void editTimeline(worldId, (list) => applyShared(list, share.items, told, pair.map((p) => p.id), now));
        const fresh = lines.length ? parseNewFact(reply) : undefined;
        if (fresh) void logToTimeline(worldId, { kind: "talk", text: fresh, characterIds: pair.map((p) => p.id), audience: "private", at: now }, world?.storyTime);
        // Saved even when empty, so a failed attempt waits for the next stretch away.
        await dispatch(updateChatOptions({
          chatId: chat.id,
          patch: { offscreenTalks: addTalk(chat.offscreenTalks, { id: `talk-${now.toString(36)}`, at: now, lines }) },
        }));
      } catch (err) {
        console.warn("Off-screen conversation failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    // Also run on demand: catch-up and Simulate a day (#191, #193).
    const offTick = registerTick("group-talk", () => check());
    return () => {
      offTick();
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch]);

  return null;
};

export default OffscreenTalker;
