import React, { useState } from "react";
import { FaRegSmile } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { Button } from "src/components/atoms/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "src/components/molecules/dropdown-menu";
import { REACTION_EMOJIS } from "src/features/ai/utils/messageTags";
import { ReactionRow as Reaction, reactionSummary } from "src/features/chat/reactions";

// Small additions to a chat bubble: the character's hidden inner thoughts
// (#10) and emoji reactions (#11).

// Tap to reveal, like a spoiler: the thoughts are what the character didn't
// say, so they stay out of the way until asked for.
export const InnerThoughts = ({ thoughts, terminal = false }: { thoughts: string; terminal?: boolean }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("mt-2 font-sans", terminal && "font-mono")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[12.5px] font-semibold opacity-75 hover:opacity-100"
      >
        {terminal ? (open ? "# hide thoughts" : "# thoughts") : open ? "Hide inner thoughts" : "💭 Inner thoughts"}
      </button>
      {/* #149: the canvas's thought card, an outlined aside in the reading font. */}
      {open && (
        <p className={cn("mt-1.5 text-[14px] italic leading-[21px] opacity-85", terminal ? "border-l-2 border-border pl-2" : "rounded-xl px-3.5 py-2.5 font-serif ring-1 ring-inset ring-border-strong")}>{thoughts}</p>
      )}
    </div>
  );
};

// Reactions sit pinned to the bubble's bottom edge, like a messaging app.
// The message reserves room for them (#149), so they never cover the next one.
// Everyone's reactions on one message (2026-10-28): the badge shows each
// emoji once and how many reacted; tapping it lists who reacted with what,
// which before only a mouse hovering over the badge could find out.
export const ReactionsBadge = ({ rows, side }: { rows: Reaction[]; side: "left" | "right" }) => {
  const { emojis, total } = reactionSummary(rows);
  const said = rows.map((r) => `${r.who} reacted ${r.emoji}`).join(", ");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Who reacted: ${said}`}
          title={said}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute -bottom-3.5 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-xl bg-raised px-[7px] font-sans text-[13px] leading-none text-muted-foreground shadow-[0_0_0_2px_rgb(var(--color-chat-bg)),var(--sh-1)] hover:bg-sunken",
            side === "right" ? "right-2.5" : "left-2.5"
          )}
        >
          {emojis.join("")}
          {total > 1 && <span className="ml-0.5 text-[11.5px] font-semibold">{total}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={side === "right" ? "end" : "start"} aria-label="Who reacted" className="min-w-[170px] p-1">
        <div className="px-2 pb-1 pt-1.5 text-[12px] font-semibold text-subtle">{total === 1 ? "1 reaction" : `${total} reactions`}</div>
        {rows.map((r, i) => (
          <DropdownMenuItem key={`${r.who}-${i}`} className="gap-2.5 px-2 py-1.5 text-[13.5px]">
            <span className="text-lg leading-none">{r.emoji}</span>
            <span className="font-semibold text-foreground">{r.who}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// The footer's "React" button: a row of emojis; the current one is marked,
// and picking it again removes it.
export const ReactionPicker = ({ current, onPick, className }: { current?: string; onPick: (emoji: string) => void; className?: string }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" aria-label="React" title="React" className={className}>
        <FaRegSmile size={13} />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="flex gap-0.5 p-1 min-w-0">
      {REACTION_EMOJIS.map((emoji) => (
        <DropdownMenuItem
          key={emoji}
          onSelect={() => onPick(emoji)}
          aria-label={current === emoji ? `Remove ${emoji} reaction` : `React with ${emoji}`}
          className={cn("h-9 w-9 justify-center rounded-md p-0 text-lg", current === emoji && "bg-primary/15")}
        >
          {emoji}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

// The same choice inside the long-press action sheet on touch screens.
export const ReactionRow = ({ current, onPick }: { current?: string; onPick: (emoji: string) => void }) => (
  <div role="group" aria-label="React" className="flex items-center gap-0.5 rounded-[28px] bg-popover p-1 shadow-sheet">
    {REACTION_EMOJIS.map((emoji) => (
      <button
        key={emoji}
        type="button"
        onClick={() => onPick(emoji)}
        aria-label={current === emoji ? `Remove ${emoji} reaction` : `React with ${emoji}`}
        aria-pressed={current === emoji}
        className={cn("grid h-11 w-11 place-items-center rounded-full text-2xl", current === emoji ? "bg-primary/15" : "hover:bg-raised")}
      >
        {emoji}
      </button>
    ))}
  </div>
);
