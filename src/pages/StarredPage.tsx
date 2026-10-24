import React, { useMemo } from "react";
import { avatarOf } from "../features/character/profileChanges";
import { useNavigate } from "react-router-dom";
import { FaStar } from "react-icons/fa";
import Header from "src/components/organisms/Header";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { useAppSelector } from "src/store/hooks";
import { quoteTextOf } from "src/features/chat/replyQuotes";
import { YOU } from "src/utils/constants";

const when = (at?: number) => {
  if (!at) return "";
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

// Starred messages (#120): every starred message across your chats, newest
// first, like WhatsApp's list; tapping one opens its chat at that message.
const StarredPage = () => {
  const navigate = useNavigate();
  const chats = useAppSelector((state) => state.chat.chats);
  const characters = useAppSelector((state) => state.character.characters);
  const items = useMemo(
    () =>
      chats
        .flatMap((chat) => (chat.content || []).filter((m) => m.bookmarked && m.id).map((m) => ({ chat, m })))
        .sort((a, b) => (b.m.timestamp || 0) - (a.m.timestamp || 0)),
    [chats]
  );
  const nameOf = (speakerId: number | undefined, fallback: string) => characters.find((c) => c.id === speakerId)?.name || fallback;

  return (
    <div className="flex h-dvh w-full flex-col">
      <Header title="Starred messages" onBack={() => navigate(-1)} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-muted-foreground">
              <FaStar size={28} className="text-subtle" />
              <p className="text-[14px]">No starred messages. Star one from its menu (or long-press it on a phone) to find it here.</p>
            </div>
          ) : (
            <ul aria-label="Starred messages">
              {items.map(({ chat, m }) => {
                const first = characters.find((c) => c.id === chat.characterIds?.[0]);
                const from = m.role === YOU ? "You" : nameOf(m.speakerId, first?.name || chat.title);
                return (
                  <li key={`${chat.id}-${m.id}`} className="border-b border-border/50">
                    <button
                      type="button"
                      onClick={() => navigate(`/chat/${chat.id}`, { state: { jumpTo: m.id } })}
                      className="flex w-full gap-3 px-4 py-3 text-left hover:bg-hover"
                      aria-label={`${from} in ${chat.title}: ${quoteTextOf(m).slice(0, 60)}`}
                    >
                      <CharacterAvatar name={first?.name || chat.title} accent={first?.accent} imageSrc={avatarOf(first)} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] font-medium text-foreground">{from} <span className="text-muted-foreground">▸ {chat.title}</span></span>
                          <span className="flex-shrink-0 text-[11.5px] text-subtle">{when(m.timestamp)}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-3 text-[14px] text-foreground">{quoteTextOf(m)}</span>
                      </span>
                      <FaStar size={11} aria-hidden className="mt-1 flex-shrink-0 text-amber-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default StarredPage;
