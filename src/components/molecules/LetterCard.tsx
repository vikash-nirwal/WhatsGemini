import React from "react";
import { FaEnvelope, FaEnvelopeOpen } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { CharacterLetter } from "src/types";
import { formatRelativeTime } from "src/utils/formatRelativeTime";

// A letter a character wrote while you were away (#61): folded like an
// envelope until opened, then shown on paper with a Reply button.
// #149: the canvas's letter - paper in every theme, a small caps label, the
// letter itself in the reading font.
export const LetterCard = ({ letter, from, onRead, onReply }: { letter: CharacterLetter; from: string; onRead: () => void; onReply?: () => void }) => (
  <details
    className="group mx-auto my-4 w-full max-w-[86%] md:max-w-[min(600px,70%)] rounded-card bg-[rgb(var(--paper))] px-4 py-3 text-[rgb(var(--paper-ink))] shadow-bubble"
    onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onRead()}
  >
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-[rgb(var(--paper-label))]">
        <FaEnvelope size={11} aria-hidden className="group-open:hidden" />
        <FaEnvelopeOpen size={11} aria-hidden className="hidden group-open:inline" />
        <span className="flex-1">A letter from {from}</span>
        {!letter.read && <span className="rounded-full bg-[rgb(var(--paper-action))] px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-[rgb(var(--paper))]">new</span>}
        <span className="text-[11px] font-normal normal-case tracking-normal">{formatRelativeTime(letter.at)}</span>
      </span>
      {/* Folded: the first line, so it reads as a letter before it's opened. */}
      <span className="mt-1.5 block font-serif text-[14px] italic leading-[21px] group-open:hidden">{letter.text.split("\n")[0].slice(0, 90)}{letter.text.length > 90 ? "…" : ""}</span>
    </summary>
    <div className="mt-2 font-serif text-[14.5px] leading-[23px] whitespace-pre-wrap">
      {letter.text}
    </div>
    {onReply && (
      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" variant="ghost" onClick={onReply} className="font-semibold text-[rgb(var(--paper-action))] hover:bg-[rgb(var(--paper-action))]/10 hover:text-[rgb(var(--paper-action))]">Reply</Button>
      </div>
    )}
  </details>
);
