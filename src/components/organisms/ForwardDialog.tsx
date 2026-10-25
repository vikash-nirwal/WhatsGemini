import React, { useState } from "react";
import { avatarOf } from "../../features/character/profileChanges";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Input } from "src/components/atoms/input";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { addMessage, fetchChats } from "src/features/chatSlice";
import { quoteTextOf } from "src/features/chat/replyQuotes";
import { YOU } from "src/utils/constants";
import { Message } from "src/types";
import { useWorldChats } from "src/hooks/useWorld";

// Forwarding (#123): pass a message on to another chat, as WhatsApp does.
// It lands there as your message, marked "Forwarded", without asking for a
// reply; the chat opens so you can add something and send.
const ForwardDialog = ({ message, onClose }: { message: Message | null; onClose: () => void }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const chats = useWorldChats();
  const characters = useAppSelector((state) => state.character.characters);
  const [query, setQuery] = useState("");
  const shown = chats.filter((c) => !c.archived && c.title.toLowerCase().includes(query.trim().toLowerCase()));

  const forwardTo = async (chatId: number) => {
    if (!message) return;
    const text = message.isVoiceNote ? quoteTextOf(message) : (message.forward?.text || (message.txt || "").replace(/\n*\[Image Context:[\s\S]*?\]\s*$/i, "").trim());
    await dispatch(addMessage({ chatId, role: YOU, text: "", forward: { text: text || "📷 Photo" }, images: message.images?.length ? message.images : undefined, noGreeting: true }));
    await dispatch(fetchChats());
    onClose();
    navigate(`/chat/${chatId}`);
  };

  return (
    <Dialog open={message != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogTitle>Forward to…</DialogTitle>
        <DialogDescription className="sr-only">Pick a chat to forward this message to</DialogDescription>
        <Input aria-label="Search chats to forward to" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul aria-label="Chats" className="flex flex-col">
          {shown.map((chat) => {
            const first = characters.find((c) => c.id === chat.characterIds?.[0]);
            return (
              <li key={chat.id}>
                <button type="button" onClick={() => void forwardTo(chat.id!)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
                  <CharacterAvatar name={first?.name || chat.title} accent={first?.accent} imageSrc={avatarOf(first)} size={36} />
                  <span className="truncate text-[14px] font-medium text-foreground">{chat.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
};

export default ForwardDialog;
