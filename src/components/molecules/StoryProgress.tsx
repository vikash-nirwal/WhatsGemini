import React from "react";
import { FaBookOpen, FaCheck, FaStepBackward } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { Button } from "src/components/atoms/button";
import { StoryScript } from "src/types";
import { isFinished } from "src/features/chat/storyScript";

// The story script's progress (#57), at the end of the chat: which beat the
// story is working toward, with manual controls for when the AI misses one
// or the user wants to skip ahead.
export const StoryProgress = ({ script, onMove, onEdit, terminal = false }: { script: StoryScript; onMove: (step: number) => void; onEdit: () => void; terminal?: boolean }) => {
  const total = script.beats.length;
  const finished = isFinished(script);
  return (
    <section
      aria-label="Story progress"
      className={cn(
        "mb-6 mx-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 font-sans text-xs",
        terminal ? "border border-border" : "rounded-2xl border border-border/60 bg-card/[0.88] shadow-soft"
      )}
    >
      <FaBookOpen aria-hidden size={12} className="text-primary flex-shrink-0" />
      <div className="min-w-0 flex-1">
        {total === 0 ? (
          <span className="text-muted-foreground">Following your story script</span>
        ) : finished ? (
          <span className="text-foreground">All {total} beats done{script.ending ? ": heading for the ending" : ""}</span>
        ) : (
          <>
            <span className="font-semibold text-foreground">Beat {script.currentBeat + 1} of {total}</span>
            <span className="text-muted-foreground">: {script.beats[script.currentBeat].text}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
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
