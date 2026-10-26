import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "../../store/hooks";
import { Character } from "../../types";
import { isNsfwCharacter } from "../character/contentRating";
import { notificationsEnabled, notifyChatMessage, OPEN_CHAT_MESSAGE, OPEN_PATH_MESSAGE, setOpenChatHandler, setOpenPathHandler } from "./notifications";
import { askForWakeUps } from "../life/backgroundSync";

// Routes notification clicks to the chat. Mounted once inside the router:
// page notifications call the handler directly, the service worker's ones
// arrive as a message from the worker.
export const useNotificationClicks = () => {
  const navigate = useNavigate();
  useEffect(() => {
    setOpenChatHandler((chatId) => navigate(`/chat/${chatId}`));
    setOpenPathHandler((path) => navigate(path));
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === OPEN_CHAT_MESSAGE && typeof event.data.chatId === "number") {
        navigate(`/chat/${event.data.chatId}`);
      }
      if (event.data?.type === OPEN_PATH_MESSAGE && typeof event.data.path === "string") {
        navigate(event.data.path);
      }
    };
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
    sw?.addEventListener("message", onMessage);
    // Android background sync (#201), with notifications on.
    if (notificationsEnabled()) void askForWakeUps();
    return () => {
      setOpenChatHandler(null);
      setOpenPathHandler(null);
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
