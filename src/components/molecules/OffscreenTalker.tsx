import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateChatOptions } from "src/features/chatSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { addTalk, buildOffscreenTalkPrompt, parseOffscreenTalk, pickPair, talkDue } from "src/features/chat/offscreenTalk";
import { formatTranscript } from "src/features/ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "src/features/ai/utils/transcript";
import { Character } from "src/types";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 20 * 1000;

// Characters talk while you're away (#58): while the app is open, a group
// chat with this switched on gets a short conversation between two of its
// members once you've been gone a while, at most one per check, on the
// cheaper helper model.
const OffscreenTalker = () => {
  const dispatch = useAppDispatch();
  const chats = useAppSelector((state) => state.chat.chats);
  const characters = useAppSelector((state) => state.character.characters);
  const persona = useAppSelector(selectActivePersona);
  const latest = useRef({ chats, characters, persona });
  latest.current = { chats, characters, persona };
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const { chats, characters, persona } = latest.current;
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
        const reply = await dispatch(generateAssistText({
          instruction: buildOffscreenTalkPrompt(pair[0], pair[1], userName, feelings, formatTranscript(recent, { userName, speakerNames: namesById }), chat.scenario),
          background: true,
        })).unwrap();
        const lines = parseOffscreenTalk(reply, pair);
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
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch]);

  return null;
};

export default OffscreenTalker;
