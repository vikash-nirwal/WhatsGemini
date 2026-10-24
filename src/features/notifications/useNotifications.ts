import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "../../store/hooks";
import { Character } from "../../types";
import { isNsfwCharacter } from "../character/contentRating";
import { notifyChatMessage, OPEN_CHAT_MESSAGE, setOpenChatHandler } from "./notifications";

// Routes notification clicks to the chat. Mounted once inside the router:
// page notifications call the handler directly, the service worker's ones
// arrive as a message from the worker.
export const useNotificationClicks = () => {
  const navigate = useNavigate();
  useEffect(() => {
    setOpenChatHandler((chatId) => navigate(`/chat/${chatId}`));
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === OPEN_CHAT_MESSAGE && typeof event.data.chatId === "number") {
        navigate(`/chat/${event.data.chatId}`);
      }
    };
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
    sw?.addEventListener("message", onMessage);
    return () => {
      setOpenChatHandler(null);
      sw?.removeEventListener("message", onMessage);
    };
  }, [navigate]);
};

// Returns a callback for ChatPage to call after saving a character's
// message; it only notifies when the user is away (see shouldNotify).
export const useChatNotifier = (chatId: number | null, members: Character[]) => {
  const privacy = useAppSelector((state) => state.settings.privacy);
  const muted = useAppSelector((state) => Boolean(state.chat.chats.find((c) => c.id === chatId)?.muted));
  return useCallback(
    (speaker: Character, text: string, images?: string[]) => {
      if (!chatId) return;
      void notifyChatMessage({
        chatId,
        speaker,
        text,
        hasImages: Boolean(images?.length),
        isNsfwChat: members.some(isNsfwCharacter),
        privacy,
        muted,
      });
    },
    [chatId, members, privacy, muted]
  );
};
