import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/atoms/button";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { useAppDispatch } from "src/store/hooks";
import { patchWorld } from "src/features/worldSlice";
import { addSuggestedPerson } from "src/features/world/addPerson";
import { useWorldCharacters } from "src/hooks/useWorld";
import { World } from "src/types";

// Someone new turned up in the world (#164): welcome them (drafted in full
// and tied to whoever they came with) or let them pass through.
export const NewcomerCard = ({ world }: { world: World }) => {
  const dispatch = useAppDispatch();
  const residents = useWorldCharacters();
  const [busy, setBusy] = useState(false);
  const sg = world.newcomer;
  if (!sg) return null;
  const welcome = async () => {
    setBusy(true);
    try {
      await dispatch(addSuggestedPerson(world, sg, residents));
      await dispatch(patchWorld(world.id, { newcomer: undefined }));
      toast.success(`${sg.name} lives in ${world.name} now`);
    } catch {
      toast.error(`Couldn't write ${sg.name} up. Try again.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Someone new" className="flex items-start gap-3 rounded-card bg-primary/[0.08] p-3 ring-1 ring-inset ring-primary/40">
      <CharacterAvatar name={sg.name} size={36} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-primary-text">Someone new arrived</div>
        <div className="text-[14px] font-bold text-foreground">{sg.name}{sg.tieWith && <span className="font-normal text-muted-foreground"> · {sg.tieWith}'s {sg.tie}</span>}</div>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{sg.idea}</p>
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void welcome()}>{busy ? "Welcoming..." : `Welcome ${sg.name}`}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void dispatch(patchWorld(world.id, { newcomer: undefined }))}>Let them pass</Button>
        </div>
      </div>
    </section>
  );
};

export default NewcomerCard;
