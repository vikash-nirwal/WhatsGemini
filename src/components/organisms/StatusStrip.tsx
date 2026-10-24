import React, { useState } from "react";
import { avatarOf } from "../../features/character/profileChanges";
import { cn } from "src/utils/cn";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { useAppDispatch } from "src/store/hooks";
import { updateCharacter } from "src/features/characterSlice";
import { hasUnseenStatus, liveStatuses, markSeen } from "src/features/character/statusUpdates";
import { feedItems } from "src/features/character/statusFeed";
import { StatusFeed } from "src/components/organisms/StatusFeed";
import { Character, CharacterStatus } from "src/types";

// The sidebar's "Status" row (#8): characters who posted in the last day,
// with a ring around the ones you haven't seen. Opening one marks it seen;
// "Reply" opens their chat with the status quoted. "Feed" (#85) shows every
// kept status, newest first, with likes and comments.
// `compact`: the collapsed sidebar's narrow column, avatars only, stacked.
export const StatusStrip = ({ characters, onReply, compact = false }: { characters: Character[]; onReply: (character: Character, status: CharacterStatus) => void; compact?: boolean }) => {
  const dispatch = useAppDispatch();
  const [viewing, setViewing] = useState<Character | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const now = Date.now();
  const posting = characters.filter((c) => liveStatuses(c, now).length > 0);
  if (posting.length === 0) return null;

  const open = (c: Character) => {
    setViewing(c);
    if (hasUnseenStatus(c, now)) dispatch(updateCharacter({ ...c, statuses: markSeen(c.statuses) }));
  };
  const viewed = viewing ? characters.find((c) => c.id === viewing.id) || viewing : null;
  const shown = viewed ? liveStatuses(viewed, now) : [];
  const reply = (c: Character, s: CharacterStatus) => {
    setViewing(null);
    setFeedOpen(false);
    onReply(c, s);
  };

  return (
    <div className={compact ? "pt-2 pb-2 border-b border-border/40 mb-1.5" : "px-3 pt-2 pb-1"}>
      {compact ? (
        <div className="sr-only">Status</div>
      ) : (
        <div className="flex items-baseline justify-between pb-1.5">
          <span className="text-[10.5px] font-semibold tracking-[0.09em] uppercase text-subtle">Status</span>
          <button type="button" onClick={() => setFeedOpen(true)} className="text-[11px] text-muted-foreground hover:text-primary">
            Feed
          </button>
        </div>
      )}
      <div role="list" aria-label="Status updates" className={compact ? "flex flex-col items-center gap-2.5 pt-1" : "flex gap-3 overflow-x-auto px-1 pt-1 pb-1"}>
        {posting.map((c) => {
          const unseen = hasUnseenStatus(c, now);
          return (
            <div key={c.id} role="listitem" className="flex-shrink-0">
            <button
              type="button"
              onClick={() => open(c)}
              aria-label={`${c.name}'s status${unseen ? ", new" : ""}`}
              title={compact ? `${c.name}'s status` : undefined}
              className={cn("flex flex-col items-center gap-1", !compact && "w-14")}
            >
              <span className={cn("rounded-full p-[2px] ring-2 ring-offset-2 ring-offset-card", unseen ? "ring-primary" : "ring-border")}>
                <CharacterAvatar name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={compact ? 34 : 40} />
              </span>
              {!compact && <span className={cn("w-full truncate text-center text-[11px]", unseen ? "font-semibold text-foreground" : "text-muted-foreground")}>{c.name}</span>}
            </button>
            </div>
          );
        })}
      </div>

      <Dialog open={viewing != null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogTitle>{viewing?.name}'s status</DialogTitle>
          <DialogDescription className="sr-only">Statuses from the last day</DialogDescription>
          {viewed && <StatusFeed items={shown.map((status) => ({ character: viewed, status }))} onReply={reply} />}
        </DialogContent>
      </Dialog>

      <Dialog open={feedOpen} onOpenChange={setFeedOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle>Feed</DialogTitle>
          <DialogDescription className="sr-only">Every character's recent statuses</DialogDescription>
          <StatusFeed items={feedItems(characters)} onReply={reply} showPoster />
        </DialogContent>
      </Dialog>
    </div>
  );
};
