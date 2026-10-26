import React from "react";
import { FaUser } from "react-icons/fa";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { avatarOf } from "src/features/character/profileChanges";
import { Character, MapPin } from "src/types";

// The live map (#196): the world's picture with who's at each place right
// now, and you. Pins are stored as percents of the picture, so the picture
// is shown whole (not cropped) to keep them where they belong. Tapping a
// place opens it.
export const LiveMap = ({ image, pins, here, youAt, onOpenPin }: { image: string; pins: MapPin[]; here: Record<string, Character[]>; youAt?: MapPin; onOpenPin: (pin: MapPin) => void }) => (
  <div role="group" aria-label="Live map" className="relative overflow-hidden rounded-xl bg-sunken">
    <img src={image} alt="" className="block h-auto w-full" />
    {pins.map((p) => {
      const people = here[p.id] || [];
      const you = youAt?.id === p.id;
      return (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpenPin(p)}
          aria-label={`${p.name} on the map${people.length ? `: ${people.map((c) => c.name).join(", ")}` : ""}${you ? ", you're here" : ""}`}
          className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center gap-0.5"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        >
          <span className="flex -space-x-1.5">
            {you && <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-background"><FaUser size={9} aria-hidden /></span>}
            {people.slice(0, 3).map((c) => <CharacterAvatar key={c.id} name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={22} className="ring-2 ring-background" />)}
          </span>
          <span className="max-w-[90px] truncate rounded bg-black/60 px-1.5 text-[10.5px] font-semibold text-white">{p.name}</span>
        </button>
      );
    })}
  </div>
);

export default LiveMap;
