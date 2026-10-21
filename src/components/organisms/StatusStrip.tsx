import React, { useState } from "react";
import { cn } from "src/utils/cn";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Button } from "src/components/atoms/button";
import { useAppDispatch } from "src/store/hooks";
import { updateCharacter } from "src/features/characterSlice";
import { hasUnseenStatus, liveStatuses, markSeen } from "src/features/character/statusUpdates";
import { formatRelativeTime } from "src/utils/formatRelativeTime";
import { Character, CharacterStatus } from "src/types";

// The sidebar's "Status" row (#8): characters who posted in the last day,
// with a ring around the ones you haven't seen. Opening one marks it seen;
// "Reply" opens their chat with the status quoted.
export const StatusStrip = ({ characters, onReply }: { characters: Character[]; onReply: (character: Character, status: CharacterStatus) => void }) => {
  const dispatch = useAppDispatch();
  const [viewing, setViewing] = useState<Character | null>(null);
  const now = Date.now();
  const posting = characters.filter((c) => liveStatuses(c, now).length > 0);
  if (posting.length === 0) return null;

  const open = (c: Character) => {
    setViewing(c);
    if (hasUnseenStatus(c, now)) dispatch(updateCharacter({ ...c, statuses: markSeen(c.statuses) }));
  };
  const shown = viewing ? liveStatuses(characters.find((c) => c.id === viewing.id) || viewing, now) : [];

  return (
    <div className="px-3 pt-2 pb-1">
      <div className="text-[10.5px] font-semibold tracking-[0.09em] uppercase text-subtle pb-1.5">Status</div>
      <div role="list" aria-label="Status updates" className="flex gap-3 overflow-x-auto px-1 pt-1 pb-1">
        {posting.map((c) => {
          const unseen = hasUnseenStatus(c, now);
          return (
            <div key={c.id} role="listitem" className="flex-shrink-0">
            <button
              type="button"
              onClick={() => open(c)}
              aria-label={`${c.name}'s status${unseen ? ", new" : ""}`}
              className="flex w-14 flex-col items-center gap-1"
            >
              <span className={cn("rounded-full p-[2px] ring-2 ring-offset-2 ring-offset-card", unseen ? "ring-primary" : "ring-border")}>
                <CharacterAvatar name={c.name} accent={c.accent} imageSrc={c.appearanceImages?.[0]} size={40} />
              </span>
              <span className={cn("w-full truncate text-center text-[11px]", unseen ? "font-semibold text-foreground" : "text-muted-foreground")}>{c.name}</span>
            </button>
            </div>
          );
        })}
      </div>

      <Dialog open={viewing != null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogTitle>{viewing?.name}'s status</DialogTitle>
          <DialogDescription className="sr-only">Statuses from the last day</DialogDescription>
          <ol className="flex flex-col gap-3" aria-label="Statuses">
            {shown.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[15px] text-foreground">{s.text}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-subtle">{formatRelativeTime(s.createdAt)}</span>
                  {viewing && (
                    <Button type="button" variant="outline" size="sm" onClick={() => { const c = viewing; setViewing(null); onReply(c, s); }}>
                      Reply
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </div>
  );
};
