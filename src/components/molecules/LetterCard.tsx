import React from "react";
import { FaEnvelope, FaEnvelopeOpen } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { CharacterLetter } from "src/types";
import { formatRelativeTime } from "src/utils/formatRelativeTime";

// A letter a character wrote while you were away (#61): folded like an
// envelope until opened, then shown on paper with a Reply button.
export const LetterCard = ({ letter, from, onRead, onReply }: { letter: CharacterLetter; from: string; onRead: () => void; onReply?: () => void }) => (
  <details
    className="group mx-auto mb-6 w-full max-w-[85%] md:max-w-[70%] rounded-xl border border-border/60 bg-card/90 px-4 py-2.5"
    onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onRead()}
  >
    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
      <FaEnvelope size={11} aria-hidden className="group-open:hidden" />
      <FaEnvelopeOpen size={11} aria-hidden className="hidden group-open:inline" />
      <span className="flex-1">A letter from {from}</span>
      {!letter.read && <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">new</span>}
      <span className="text-[11px] font-normal text-subtle">{formatRelativeTime(letter.at)}</span>
    </summary>
    <div className="mt-3 rounded-lg bg-background/80 border border-border/40 px-4 py-3 font-serif text-[14px] leading-relaxed text-foreground whitespace-pre-wrap">
      {letter.text}
    </div>
    {onReply && (
      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={onReply}>Reply</Button>
      </div>
    )}
  </details>
);
