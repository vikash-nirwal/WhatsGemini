import { useEffect, useRef } from "react";
import { registerTick } from "src/features/life/ticks";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { addChatNotice, addMessage, fetchChats, updateChatOptions } from "src/features/chatSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { buildGoBetweenPrompt, goBetweenDue, mainChatWith, mutualFriends } from "src/features/chat/blocking";
import { formatTranscript } from "src/features/ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "src/features/ai/utils/transcript";
import { cleanFirstText } from "src/features/character/firstTexts";
import { AI } from "src/utils/constants";
import { useLivingCharacters } from "src/hooks/useWorld";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 40 * 1000;

// The go-between (#133): now and then, someone you blocked asks a friend
// you share to put in a word, and that friend brings it up in your chat
// with them - a notice, then their text, in their own voice. Their next
// replies know about it (blockNotesFor), so you can talk it through.
const GoBetween = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const chats = useAppSelector((state) => state.chat.chats);
  const characters = useLivingCharacters();
  const persona = useAppSelector(selectActivePersona);
  const latest = useRef({ chats, characters, persona });
  latest.current = { chats, characters, persona };
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const { chats, characters, persona } = latest.current;
      const blockedChat = chats.find((c) => c.characterIds?.length === 1 && goBetweenDue(c, now));
      const blocked = blockedChat && characters.find((c) => c.id === blockedChat.characterIds![0]);
      if (!blockedChat?.id || !blocked) return;
      const friends = mutualFriends(blocked, characters, chats);
      const friend = friends[Math.floor(Math.random() * friends.length)];
      // Recorded even with nobody to ask, so it isn't checked again too soon.
      const nudged = { ...blockedChat.blocked!, nudgedAt: now, ...(friend ? { nudgedBy: friend.id } : {}) };
      busy.current = true;
      try {
        await dispatch(updateChatOptions({ chatId: blockedChat.id, patch: { blocked: nudged } }));
        const friendChat = friend && mainChatWith(chats, friend.id);
        if (!friend || !friendChat?.id) return;
        const userName = persona?.name?.trim() || "the user";
        const recent = formatTranscript(trimToLatestSummary(friendChat.content || []).slice(-8), { userName, charName: friend.name });
        const reply = await dispatch(generateAssistText({
          instruction: buildGoBetweenPrompt(friend, blocked, userName, { fight: blockedChat.conflict?.about, recent }),
          background: true,
          activity: { kind: "other", text: `${friend.name} brought up ${blocked.name}`, characterId: friend.id, name: friend.name },
        })).unwrap();
        const text = cleanFirstText(reply);
        if (!text) return;
        await dispatch(addChatNotice({ chatId: friendChat.id, text: `${friend.name} is talking about ${blocked.name}` }));
        await dispatch(addMessage({ chatId: friendChat.id, role: AI, text, speakerId: friend.id }));
        await dispatch(fetchChats());
        toast.message(`${friend.name} texted you`, { description: text.length > 90 ? `${text.slice(0, 87)}...` : text, action: { label: "Open", onClick: () => navigate(`/chat/${friendChat.id}`) } });
      } catch (err) {
        console.warn("Go-between failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    // Also run on demand: catch-up and Simulate a day (#191, #193).
    const offTick = registerTick("go-between", () => check());
    return () => {
      offTick();
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch, navigate]);

  return null;
};

export default GoBetween;
