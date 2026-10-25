import React, { useMemo, useState } from "react";
import { avatarOf } from "../features/character/profileChanges";
import { useNavigate } from "react-router-dom";
import { FaChevronRight, FaStar } from "react-icons/fa";
import Header from "src/components/organisms/Header";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { useAppSelector } from "src/store/hooks";
import { quoteTextOf } from "src/features/chat/replyQuotes";
import { YOU } from "src/utils/constants";
import { useCurrentWorld, useWorldChats } from "src/hooks/useWorld";
import { cn } from "src/utils/cn";

const when = (at?: number) => {
  if (!at) return "";
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

// Starred messages (#120): every starred message across your chats, newest
// first, like WhatsApp's list; tapping one opens its chat at that message.
const StarredPage = () => {
  const navigate = useNavigate();
  const chats = useWorldChats();
  const { name: worldTitle } = useCurrentWorld();
  const characters = useAppSelector((state) => state.character.characters);
  const items = useMemo(
    () =>
      chats
        .flatMap((chat) => (chat.content || []).filter((m) => m.bookmarked && m.id).map((m) => ({ chat, m })))
        .sort((a, b) => (b.m.timestamp || 0) - (a.m.timestamp || 0)),
    [chats]
  );
  const nameOf = (speakerId: number | undefined, fallback: string) => characters.find((c) => c.id === speakerId)?.name || fallback;

  // #156: chips to narrow by chat, and each message as its bubble.
  const [only, setOnly] = useState<number | null>(null);
  const chatsWithStars = Array.from(new Map(items.map(({ chat }) => [chat.id, chat])).values());
  const shown = only == null ? items : items.filter(({ chat }) => chat.id === only);

  return (
    <div className="flex h-dvh w-full flex-col">
      <Header title="Starred" subtitle={`${worldTitle} · ${items.length} ${items.length === 1 ? "message" : "messages"}`} onBack={() => navigate(-1)} />
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-2xl">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-muted-foreground">
              <FaStar size={28} className="text-subtle" />
              <p className="text-[14px]">No starred messages. Star one from its menu (or long-press it on a phone) to find it here.</p>
            </div>
          ) : (
            <>
              {chatsWithStars.length > 1 && (
                <div role="group" aria-label="Filter by chat" className="flex gap-2 overflow-x-auto px-4 pb-1 pt-3 [scrollbar-width:none]">
                  {[{ id: null as number | null, title: "All" }, ...chatsWithStars.map((c) => ({ id: c.id ?? null, title: c.title }))].map((c) => (
                    <button key={c.id ?? "all"} type="button" aria-pressed={only === c.id} onClick={() => setOnly(c.id)}
                      className={cn("h-9 flex-none rounded-full px-3.5 text-[13px] font-semibold", only === c.id ? "bg-primary/15 text-foreground ring-1 ring-inset ring-primary" : "bg-raised text-foreground ring-1 ring-inset ring-border")}>
                      {c.title}
                    </button>
                  ))}
                </div>
              )}
              <ul aria-label="Starred messages" className="flex flex-col gap-[18px] px-3 py-3">
                {shown.map(({ chat, m }) => {
                  const first = characters.find((c) => c.id === chat.characterIds?.[0]);
                  const from = m.role === YOU ? "You" : nameOf(m.speakerId, first?.name || chat.title);
                  const speaker = m.role === YOU ? undefined : characters.find((c) => c.id === (m.speakerId ?? first?.id));
                  return (
                    <li key={`${chat.id}-${m.id}`}>
                      <button
                        type="button"
                        onClick={() => navigate(`/chat/${chat.id}`, { state: { jumpTo: m.id } })}
                        className="flex w-full flex-col gap-1.5 rounded-xl p-1 text-left hover:bg-raised/50"
                        aria-label={`${from} in ${chat.title}: ${quoteTextOf(m).slice(0, 60)}`}
                      >
                        <span className="flex items-center gap-2 px-1">
                          <CharacterAvatar name={from} accent={speaker?.accent} imageSrc={speaker ? avatarOf(speaker) : undefined} size={24} />
                          <span className="text-[12.5px] font-bold text-foreground">{from}</span>
                          <span className="truncate text-[12.5px] text-subtle">in {chat.title}</span>
                          <span className="flex-1" />
                          <span className="flex-none text-[12px] text-subtle">{when(m.timestamp)}</span>
                          <FaChevronRight size={10} aria-hidden className="text-subtle" />
                        </span>
                        <span className={cn("max-w-[92%] rounded-bubble px-3 py-2 font-serif text-[15px] leading-[22px] line-clamp-4", m.role === YOU ? "self-end rounded-tr-[5px] bg-bubble-out text-bubble-out-text" : "self-start rounded-tl-[5px] bg-bubble-in text-bubble-in-text")}>
                          {quoteTextOf(m)}
                          <FaStar size={10} aria-hidden className="ml-1.5 inline text-amber-500" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StarredPage;
