import React, { useEffect, useState } from "react";
import { avatarOf } from "../../features/character/profileChanges";
import { useNavigate } from "react-router-dom";
import { FaArrowRight, FaCheck, FaInfoCircle, FaSearch } from "react-icons/fa";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Input } from "src/components/atoms/input";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { addMessage, fetchChats } from "src/features/chatSlice";
import { quoteTextOf } from "src/features/chat/replyQuotes";
import { YOU } from "src/utils/constants";
import { Message } from "src/types";
import { useCurrentWorld, useWorldChats } from "src/hooks/useWorld";
import { cn } from "src/utils/cn";

// Forwarding (#123): pass a message on to other chats, as WhatsApp does. It
// lands there as your message, marked "Forwarded", without asking for a
// reply. #156: pick one or more chats, add a note if you like, then Forward;
// with one chat picked, that chat opens.
const ForwardDialog = ({ message, onClose }: { message: Message | null; onClose: () => void }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const chats = useWorldChats();
  const { name: worldName } = useCurrentWorld();
  const characters = useAppSelector((state) => state.character.characters);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (message) {
      setPicked([]);
      setNote("");
      setQuery("");
    }
  }, [message]);
  const shown = chats
    .filter((c) => !c.archived && c.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.content?.[b.content.length - 1]?.timestamp || b.timestamp || 0) - (a.content?.[a.content.length - 1]?.timestamp || a.timestamp || 0));
  const toggle = (id: number) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const text = message ? (message.isVoiceNote ? quoteTextOf(message) : (message.forward?.text || (message.txt || "").replace(/\n*\[Image Context:[\s\S]*?\]\s*$/i, "").trim())) : "";

  const send = async () => {
    if (!message || picked.length === 0) return;
    setSending(true);
    for (const chatId of picked) {
      await dispatch(addMessage({ chatId, role: YOU, text: "", forward: { text: text || "📷 Photo" }, images: message.images?.length ? message.images : undefined, noGreeting: true }));
      if (note.trim()) await dispatch(addMessage({ chatId, role: YOU, text: note.trim(), noGreeting: true }));
    }
    await dispatch(fetchChats());
    setSending(false);
    onClose();
    if (picked.length === 1) navigate(`/chat/${picked[0]}`);
  };

  const names = picked.map((id) => chats.find((c) => c.id === id)?.title).filter(Boolean);

  return (
    <Dialog open={message != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sheet" className="bg-background px-3">
        <div className="flex flex-col px-1 pb-2">
          <DialogTitle className="text-[17px]">Forward to…</DialogTitle>
          <span className="text-[12.5px] text-subtle">{picked.length ? `${picked.length} selected` : "Pick one or more chats"}</span>
        </div>
        <DialogDescription className="sr-only">Pick chats to forward this message to</DialogDescription>
        <div className="mb-3 flex overflow-hidden rounded-xl bg-raised ring-1 ring-inset ring-border">
          <span aria-hidden className="w-1 flex-none bg-primary" />
          <p className="line-clamp-2 px-3 py-2 font-serif text-[14px] text-foreground">{text || "📷 Photo"}</p>
        </div>
        <div className="relative mb-1">
          <FaSearch size={12} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
          <Input aria-label="Search chats to forward to" placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 rounded-full bg-raised pl-9 shadow-none" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <span className="px-3 pb-1 pt-2 text-[11.5px] font-bold uppercase tracking-[0.06em] text-subtle">Recent chats</span>
          <ul aria-label="Chats" className="flex flex-col">
            {shown.map((chat) => {
              const first = characters.find((c) => c.id === chat.characterIds?.[0]);
              const on = picked.includes(chat.id!);
              const last = chat.content?.[chat.content.length - 1];
              return (
                <li key={chat.id}>
                  <button type="button" aria-pressed={on} onClick={() => toggle(chat.id!)} className="flex min-h-[60px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-raised">
                    <CharacterAvatar name={first?.name || chat.title} accent={first?.accent} imageSrc={avatarOf(first)} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-foreground">{chat.title}</span>
                      {last?.txt && <span className="block truncate text-[12.5px] text-subtle">{last.txt}</span>}
                    </span>
                    <span className={cn("grid h-6 w-6 flex-none place-items-center rounded-full", on ? "bg-primary text-primary-foreground" : "ring-2 ring-inset ring-border-strong")}>{on && <FaCheck size={10} />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mx-3 mt-2.5 flex items-start gap-2.5 rounded-xl bg-sunken px-3 py-2.5">
            <FaInfoCircle size={13} className="mt-0.5 flex-none text-subtle" />
            <p className="text-[12px] text-muted-foreground">Only chats in {worldName}. Characters in other worlds can't receive this.</p>
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2.5 border-t border-border pt-2.5">
          {names.length > 0 && <span className="truncate px-1 text-[12.5px] text-muted-foreground">To: <b className="text-foreground">{names.join(", ")}</b></span>}
          <div className="flex items-center gap-2">
            <Input aria-label="Add a message" placeholder="Add a message" value={note} onChange={(e) => setNote(e.target.value)} className="h-12 flex-1 rounded-full bg-raised px-4 shadow-none" />
            <button type="button" aria-label="Forward" disabled={picked.length === 0 || sending} onClick={() => void send()} className="grid h-12 w-12 flex-none place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"><FaArrowRight size={16} /></button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ForwardDialog;
