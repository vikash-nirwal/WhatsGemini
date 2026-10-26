import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Button } from "src/components/atoms/button";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { addChat } from "src/features/chatSlice";
import { updateCharacter } from "src/features/characterSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { avatarOf } from "src/features/character/profileChanges";
import { placeScenario } from "src/features/world/places";
import { Character, MapPin } from "src/types";

// A place on the world map (#165): who's there now, who usually is, and a
// scene that starts there with the people you pick.
export const PlaceDialog = ({ pin, cast, present, onOpenChange }: { pin: MapPin | null; cast: Character[]; present: Character[]; onOpenChange: (open: boolean) => void }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const persona = useAppSelector(selectActivePersona);
  const [chosen, setChosen] = useState<number[]>([]);
  // Who's there when it opens; `present` is a new list every render.
  const presentKey = present.map((c) => c.id).join(",");
  useEffect(() => setChosen(presentKey ? presentKey.split(",").map(Number) : []), [pin?.id, presentKey]);
  if (!pin) return null;
  const toggle = (id: number) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const start = async () => {
    const people = cast.filter((c) => chosen.includes(c.id));
    const chat = await dispatch(addChat({ title: people.length === 1 ? people[0].name : `At ${pin.name}`, characterIds: people.map((c) => c.id), scenario: placeScenario(pin.name, people.map((c) => c.name), persona?.name?.trim() || "You") })).unwrap();
    onOpenChange(false);
    navigate(`/chat/${chat.id}`);
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="sheet" className="px-4">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
          <DialogTitle className="pt-1">{pin.name}</DialogTitle>
          <DialogDescription>{present.length ? `Here now: ${present.map((c) => c.name).join(", ")}.` : "Nobody's here right now."} Pick who's in the scene, and mark who usually spends time here.</DialogDescription>
          <ul aria-label={`People at ${pin.name}`} className="flex flex-col gap-1.5">
            {cast.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 ring-1 ring-inset ring-border">
                <CharacterAvatar name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={32} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">{c.name}{present.some((p) => p.id === c.id) && <span className="font-normal text-subtle"> · here now</span>}</span>
                <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <input type="checkbox" checked={c.hangout === pin.id} onChange={() => void dispatch(updateCharacter({ ...c, hangout: c.hangout === pin.id ? undefined : pin.id }))} aria-label={`${c.name} usually here`} />
                  Usually here
                </label>
                <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`${c.name} in the scene`} />
                  In scene
                </label>
              </li>
            ))}
          </ul>
          <Button type="button" disabled={!chosen.length} onClick={() => void start()}>Start a scene here</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlaceDialog;
