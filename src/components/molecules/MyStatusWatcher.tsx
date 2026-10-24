import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { addChat, addMessage, fetchChats } from "src/features/chatSlice";
import { changeMyStatuses, loadMyStatuses } from "src/features/myStatusSlice";
import { dueReplies } from "src/features/status/myStatuses";
import { isNsfwCharacter } from "src/features/character/contentRating";
import { notifyChatMessage } from "src/features/notifications/notifications";
import { AI } from "src/utils/constants";
import { Chat } from "src/types";

const CHECK_EVERY_MS = 30 * 1000;
const FIRST_CHECK_MS = 5 * 1000;

// Your own statuses (#117): loads them, and delivers a character's private
// reply to one when its time comes, into your chat with them (made if
// needed), quoting the status. Only while the app is open.
const MyStatusWatcher = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const statuses = useAppSelector((state) => state.myStatus.statuses);
  const chats = useAppSelector((state) => state.chat.chats);
  const characters = useAppSelector((state) => state.character.characters);
  const privacy = useAppSelector((state) => state.settings.privacy);
  const latest = useRef({ statuses, chats, characters, privacy, path: location.pathname });
  latest.current = { statuses, chats, characters, privacy, path: location.pathname };
  const busy = useRef(false);

  useEffect(() => {
    dispatch(loadMyStatuses());
  }, [dispatch]);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const { statuses, chats, characters, privacy, path } = latest.current;
      const due = dueReplies(statuses, Date.now());
      if (due.length === 0) return;
      busy.current = true;
      try {
        for (const { status, index } of due) {
          const reply = status.replies![index];
          const character = characters.find((c) => c.id === reply.characterId);
          // Marked first, so a failure never sends it twice.
          await dispatch(changeMyStatuses((list) => list.map((s) => (s.id === status.id ? { ...s, replies: (s.replies || []).map((r, i) => (i === index ? { ...r, sent: true } : r)) } : s))));
          if (!character) continue;
          let chat: Chat | undefined = chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === character.id && !c.whatIf && c.memoryScope !== "chat");
          if (!chat) chat = await dispatch(addChat({ title: character.name, characterIds: [character.id] })).unwrap();
          if (!chat?.id) continue;
          await dispatch(addMessage({ chatId: chat.id, role: AI, text: reply.text, speakerId: character.id, noGreeting: true, quotedStatus: { owner: "you", text: status.text, photo: Boolean(status.image) } }));
          await dispatch(fetchChats());
          const shown = await notifyChatMessage({ chatId: chat.id, speaker: character, text: reply.text, isNsfwChat: isNsfwCharacter(character), privacy, muted: chat.muted });
          if (!shown && !chat.muted && path !== `/chat/${chat.id}`) {
            const chatId = chat.id;
            toast.message(`${character.name} replied to your status`, { description: reply.text, action: { label: "Open", onClick: () => navigate(`/chat/${chatId}`) } });
          }
        }
      } catch (err) {
        console.warn("Status reply failed (non-fatal):", err);
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
  }, [dispatch, navigate]);

  return null;
};

export default MyStatusWatcher;
