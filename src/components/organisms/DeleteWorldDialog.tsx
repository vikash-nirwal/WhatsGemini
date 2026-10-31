import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { Checkbox } from "src/components/atoms/checkbox";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { avatarOf } from "src/features/character/profileChanges";
import { MY_WORLD } from "src/features/world/currentWorld";
import { deleteWorldWithPeople } from "src/features/world/deleteWorldJob";

// Deleting a world takes its people and their chats with it (2026-10-31),
// except the ones you tick: they move to Default, as a variant inside the
// card of the person they were copied from when that person is there.
export const DeleteWorldDialog = ({ world, onClose }: { world: { id: number; name: string } | null; onClose: () => void }) => {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.character.characters);
  const residents = useMemo(() => (world ? characters.filter((c) => c.worldId === world.id) : []), [characters, world]);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const variantOf = (cardOf?: number) => characters.find((o) => o.id === cardOf && o.worldId == null);

  const close = () => {
    setKeep(new Set());
    onClose();
  };
  const remove = async () => {
    if (!world) return;
    setDeleting(true);
    try {
      await dispatch(deleteWorldWithPeople(world.id, Array.from(keep)));
      close();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={Boolean(world)} onOpenChange={(open) => !open && !deleting && close()}>
      <DialogContent className="overflow-y-auto">
        <DialogTitle>Delete {world?.name}?</DialogTitle>
        <DialogDescription>
          {residents.length
            ? `Its people and their chats are deleted with it. Tick anyone you want to keep: they move to ${MY_WORLD}, with their chats and memories.`
            : "It has nobody in it. Adventures set here keep their own history."}
        </DialogDescription>
        {residents.length > 0 && (
          <ul aria-label="Keep anyone?" className="flex flex-col gap-1 pt-1">
            {residents.map((c) => {
              const original = variantOf(c.cardOf);
              const id = `keep-${c.id}`;
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <CharacterAvatar name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={36} />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block truncate text-[15px] font-semibold text-foreground">{c.name}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {original ? `Kept as a variant in ${original.name}'s card` : `Kept as their own person in ${MY_WORLD}`}
                    </span>
                  </label>
                  <Checkbox id={id} aria-label={`Keep ${c.name}`} checked={keep.has(c.id)} onCheckedChange={(on) => setKeep((k) => { const next = new Set(k); if (on) next.add(c.id); else next.delete(c.id); return next; })} />
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={close} disabled={deleting}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={() => void remove()} disabled={deleting}>
            {deleting ? "Deleting..." : keep.size ? `Delete, keep ${keep.size}` : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
