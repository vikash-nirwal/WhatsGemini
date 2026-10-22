import React from "react";
import { FaUserFriends } from "react-icons/fa";
import { OffscreenTalk } from "src/types";
import { cn } from "src/utils/cn";

// A conversation two members had while you were away (#58), folded until
// you open it. Opening it the first time marks it read.
export const OffscreenTalkCard = ({ talk, namesById, onSeen }: { talk: OffscreenTalk; namesById: Record<number, string>; onSeen: () => void }) => {
  const names = [...new Set(talk.lines.map((l) => namesById[l.speakerId]).filter(Boolean))];
  const title = `${names.join(" and ")} talked while you were gone`;
  return (
    <details
      className="group mx-auto mb-6 w-full max-w-[85%] md:max-w-[70%] rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 text-[13px]"
      onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onSeen()}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
        <FaUserFriends size={11} aria-hidden />
        <span className="flex-1">{title}</span>
        {!talk.seen && <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">new</span>}
        <span className="text-[11px] font-medium text-primary group-open:hidden">Read</span>
      </summary>
      <ol aria-label={title} className="mt-2 flex flex-col gap-1.5">
        {talk.lines.map((line, i) => (
          <li key={i} className={cn("leading-snug text-foreground")}>
            <span className="font-semibold">{namesById[line.speakerId] || "?"}:</span> {line.text}
          </li>
        ))}
      </ol>
    </details>
  );
};
