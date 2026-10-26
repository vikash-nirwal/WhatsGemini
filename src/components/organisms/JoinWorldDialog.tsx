import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { addCharacter } from "src/features/characterSlice";
import { rootOf, worldCopy } from "src/features/character/card";
import { worldName, worldOf } from "src/features/world/currentWorld";
import { avatarOf } from "src/features/character/profileChanges";
import { useCurrentWorld } from "src/hooks/useWorld";

// Membership (#143): bring someone from another world into this one. They
// arrive as their own copy: the same card to start, none of what happened
// elsewhere, and edited or deleted on its own from then on.
// `target`: a world other than the one on screen (the world editor's cast).
export const JoinWorldDialog = ({ open, onOpenChange, target }: { open: boolean; onOpenChange: (open: boolean) => void; target?: { id: number; name: string } }) => {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.character.characters);
  const onScreen = useCurrentWorld();
  const worlds = onScreen.worlds;
  const currentWorldId = target ? target.id : onScreen.currentWorldId;
  const name = target ? target.name : onScreen.name;

  // Everyone not here yet - each world's version of them, since copies go
  // their own way and remember different things.
  const candidates = useMemo(() => {
    const here = new Set(characters.filter((c) => worldOf(c, worlds) === currentWorldId).map(rootOf));
    return characters.filter((c) => !here.has(rootOf(c)));
  }, [characters, worlds, currentWorldId]);
  const [memories, setMemories] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sheet" className="overflow-y-auto">
        <DialogTitle>Add someone to {name}</DialogTitle>
        <DialogDescription>A copy of them joins, with the same look and personality. Change or delete the copy without touching the original.</DialogDescription>
        <div role="radiogroup" aria-label="What they bring" className="grid grid-cols-2 gap-2 pt-2">
          {([[false, "Fresh start", "Their card only; they meet everyone anew."], [true, "Their memories", "What they know and how your bond got where it is."]] as const).map(([value, title, hint]) => (
            <button key={title} type="button" role="radio" aria-checked={memories === value} onClick={() => setMemories(value)}
              className={memories === value ? "rounded-card bg-primary/10 p-3 text-left ring-2 ring-inset ring-primary" : "rounded-card bg-raised p-3 text-left ring-1 ring-inset ring-border"}>
              <span className="block text-[14px] font-bold text-foreground">{title}</span>
              <span className="block text-[12px] text-subtle">{hint}</span>
            </button>
          ))}
        </div>
        {candidates.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Everyone from your other worlds is already here.</p>
        ) : (
          <ul className="flex flex-col gap-1 pt-2" aria-label="People in other worlds">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <CharacterAvatar name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-foreground">{c.name}</div>
                  <div className="truncate text-[12.5px] text-muted-foreground">From {worldName(worldOf(c, worlds), worlds)}{memories ? ` · ${(c.memory?.length || 0) + (c.pinnedMemory?.length || 0)} facts` : ""}</div>
                </div>
                <Button size="sm" aria-label={`Add ${c.name}`} onClick={() => dispatch(addCharacter(worldCopy(c, currentWorldId, { memories })))}>Add</Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};
