import React, { useState } from "react";
import { FaRegSmile } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { Button } from "src/components/atoms/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "src/components/molecules/dropdown-menu";
import { REACTION_EMOJIS } from "src/features/ai/utils/messageTags";

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
        className="text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {terminal ? (open ? "# hide thoughts" : "# thoughts") : open ? "Hide inner thoughts" : "💭 Inner thoughts"}
      </button>
      {open && (
        <p className="mt-1 text-sm italic text-muted-foreground border-l-2 border-border pl-2">{thoughts}</p>
      )}
    </div>
  );
};

// A reaction pinned to the bubble's bottom edge, like a messaging app.
export const ReactionBadge = ({ emoji, label, side }: { emoji: string; label: string; side: "left" | "right" }) => (
  <span
    role="img"
    aria-label={label}
    title={label}
    className={cn(
      "absolute -bottom-3 flex h-6 min-w-6 items-center justify-center rounded-full border border-border bg-card px-1 text-sm leading-none shadow-soft",
      side === "right" ? "right-3" : "left-3"
    )}
  >
    {emoji}
  </span>
);

// The footer's "React" button: a row of emojis; the current one is marked,
// and picking it again removes it.
export const ReactionPicker = ({ current, onPick, className }: { current?: string; onPick: (emoji: string) => void; className?: string }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" aria-label="React" title="React" className={className}>
        <FaRegSmile size={12} />
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
  <div role="group" aria-label="React" className="flex justify-around px-2 pb-2 pt-1 border-b border-border mb-1">
    {REACTION_EMOJIS.map((emoji) => (
      <button
        key={emoji}
        type="button"
        onClick={() => onPick(emoji)}
        aria-label={current === emoji ? `Remove ${emoji} reaction` : `React with ${emoji}`}
        aria-pressed={current === emoji}
        className={cn("h-11 w-11 rounded-full text-2xl", current === emoji ? "bg-primary/15" : "hover:bg-secondary")}
      >
        {emoji}
      </button>
    ))}
  </div>
);
