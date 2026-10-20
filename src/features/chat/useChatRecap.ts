import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { writeRecap } from "../aiSlice";
import { updateChatOptions } from "../chatSlice";
import { Chat, Message } from "../../types";
import { TranscriptNames } from "../ai/utils/transcript";
import { decideRecap } from "./recap";

export interface RecapView {
  status: "loading" | "ready" | "error";
  text?: string;
  onDismiss: () => void;
  onRetry: () => void;
}

// The "Previously on..." card for the open chat (#46): undefined when there's
// nothing to show. Each recap is written at most once per return (the
// attempt is remembered by the message it covers) and saved on the chat.
export const useChatRecap = (chat: Chat | undefined, messages: Message[], names: TranscriptNames): RecapView | undefined => {
  const dispatch = useAppDispatch();
  const afterDays = useAppSelector((state) => state.settings.recapAfterDays);
  // Decided when the chat opens (or its last message changes), not on every
  // render, so the card doesn't vanish or appear while it's on screen.
  const lastId = messages[messages.length - 1]?.id;
  const decision = useMemo(
    () => decideRecap(messages, chat?.recap, Date.now(), afterDays),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat?.id, lastId, chat?.recap, afterDays]
  );
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const attempted = useRef<string | null>(null);
  const namesRef = useRef(names);
  namesRef.current = names;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const generate = useCallback(
    async (forMessageId: string) => {
      if (!chat?.id) return;
      attempted.current = forMessageId;
      setFailedFor(null);
      try {
        const text = await dispatch(writeRecap({ messages: messagesRef.current, names: namesRef.current })).unwrap();
        await dispatch(updateChatOptions({ chatId: chat.id, patch: { recap: { text, forMessageId, createdAt: Date.now() } } }));
      } catch {
        setFailedFor(forMessageId);
      }
    },
    [chat?.id, dispatch]
  );

  useEffect(() => {
    if (decision.kind === "generate" && attempted.current !== decision.forMessageId) void generate(decision.forMessageId);
  }, [decision, generate]);

  const dismiss = useCallback(() => {
    if (!chat?.id) return;
    const forMessageId = decision.kind === "cached" ? decision.recap.forMessageId : decision.kind === "generate" ? decision.forMessageId : undefined;
    if (!forMessageId) return;
    const text = decision.kind === "cached" ? decision.recap.text : "";
    dispatch(updateChatOptions({ chatId: chat.id, patch: { recap: { text, forMessageId, createdAt: Date.now(), dismissed: true } } }));
  }, [chat?.id, decision, dispatch]);

  if (decision.kind === "none") return undefined;
  if (decision.kind === "cached") return { status: "ready", text: decision.recap.text, onDismiss: dismiss, onRetry: () => undefined };
  const retry = () => void generate(decision.forMessageId);
  return { status: failedFor === decision.forMessageId ? "error" : "loading", onDismiss: dismiss, onRetry: retry };
};
