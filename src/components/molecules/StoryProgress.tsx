import React, { useState } from "react";
import { FaBookOpen, FaCheck, FaChevronUp, FaStepBackward } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { Button } from "src/components/atoms/button";
import { StoryScript } from "src/types";
import { isFinished } from "src/features/chat/storyScript";

// The story script's progress (#57), at the end of the chat. Folded, it's a
// thin bar with a segment per beat, so it doesn't pull the reader out of the
// scene; the story moves on by itself as replies reach each beat. Clicking
// the bar opens the full section: every beat, and manual controls for when
// the story needs a nudge.
export const StoryProgress = ({ script, onMove, onEdit, terminal = false }: { script: StoryScript; onMove: (step: number) => void; onEdit: () => void; terminal?: boolean }) => {
  const [open, setOpen] = useState(false);
  const total = script.beats.length;
  const finished = isFinished(script);
  const current = Math.min(script.currentBeat, total);
  const summary =
    total === 0
      ? "Following your story script"
      : finished
        ? `All ${total} beats done${script.ending ? ": heading for the ending" : ""}`
        : `Beat ${current + 1} of ${total}`;

  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-label={`Story progress: ${summary}. Show the story`}
        title={total > 0 && !finished ? `${summary}: ${script.beats[current].text}` : summary}
        onClick={() => setOpen(true)}
        className="mb-6 mx-auto flex w-full max-w-xl items-center gap-2.5 px-4 py-2 opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <FaBookOpen aria-hidden size={10} className="flex-shrink-0 text-subtle" />
        <span aria-hidden className="flex flex-1 gap-1">
          {total === 0 ? (
            <span className={cn("h-[3px] flex-1 bg-primary/40", !terminal && "rounded-full")} />
          ) : (
            script.beats.map((beat, i) => (
              <span
                key={beat.id}
                className={cn(
                  "h-[3px] flex-1 transition-colors duration-700",
                  !terminal && "rounded-full",
                  i < current ? "bg-primary" : i === current ? "bg-primary/35" : "bg-border"
                )}
              />
            ))
          )}
        </span>
      </button>
    );
  }

  return (
    <section
      aria-label="Story progress"
      className={cn(
        "mb-6 mx-auto max-w-xl px-4 py-3 font-sans text-xs",
        terminal ? "border border-border" : "rounded-2xl border border-border/60 bg-card/[0.88] shadow-soft"
      )}
    >
      <div className="flex items-center gap-2">
        <FaBookOpen aria-hidden size={12} className="text-primary flex-shrink-0" />
        <span className="min-w-0 flex-1 font-semibold text-foreground">{summary}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setOpen(false)} aria-label="Hide the story" aria-expanded>
          <FaChevronUp size={10} />
        </Button>
      </div>
      {total > 0 && (
        <ol className="mt-2 space-y-1.5">
          {script.beats.map((beat, i) => (
            <li
              key={beat.id}
              aria-current={i === current ? "step" : undefined}
              className={cn("flex items-start gap-2", i < current ? "text-muted-foreground" : i === current ? "text-foreground" : "text-subtle")}
            >
              <span aria-hidden className="mt-[3px] flex h-3 w-3 flex-shrink-0 items-center justify-center">
                {i < current ? <FaCheck size={9} className="text-primary" /> : <span className={cn("h-1.5 w-1.5", !terminal && "rounded-full", i === current ? "bg-primary" : "bg-border")} />}
              </span>
              <span className={cn(i === current && "font-medium")}>{beat.text}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1 border-t border-border/50 pt-2">
        <span className="w-full text-[11px] text-subtle sm:mr-auto sm:w-auto">{total > 0 ? "Moves on by itself as the story reaches each beat." : "Every reply stays inside your story."}</span>
        {total > 0 && (
          <>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => onMove(-1)} disabled={script.currentBeat === 0} aria-label="Previous beat">
              <FaStepBackward size={10} />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => onMove(1)} disabled={finished} aria-label="Mark beat done">
              <FaCheck size={10} /> Done
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </section>
  );
};
