import React, { useState } from "react";
import { FaMapMarkerAlt, FaTimes } from "react-icons/fa";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import { Select } from "src/components/molecules/form-controls/FormSelect";
import { Faction, MapPin, WorldMap } from "src/types";
import { clampPercent, factionColor, factionOfPin, factionsOnMap, makePinId, pinsShown } from "src/features/world/worldMap";
import { cn } from "src/utils/cn";

interface WorldMapViewProps {
  map: WorldMap;
  hereId?: string; // the pin shown as "you are here"
  onChange?: (map: WorldMap) => void; // editable when given: click the map to add a pin
  factions?: Faction[]; // the world's families and factions, for whose place a pin is (#246)
  className?: string;
}

// A World's map (#66) with its pins. In the editor, clicking the picture
// drops a pin there and clicking a pin selects it to rename, give to a
// faction or remove. Pins held by a faction show in its colour, with a
// legend whose entries also filter the map to that faction's places (#246).
export const WorldMapView: React.FC<WorldMapViewProps> = ({ map, hereId, onChange, factions = [], className }) => {
  const [selected, setSelected] = useState<string | null>(null);
  // The legend's filter: a faction's id, "none" for places nobody holds, or unset for all.
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const editable = Boolean(onChange);
  const pin = map.pins.find((p) => p.id === selected);
  const here = map.pins.find((p) => p.id === hereId);
  const legend = factionsOnMap(map.pins, factions);
  const unheld = map.pins.some((p) => !factionOfPin(p, factions));
  // A filter whose faction no longer holds a place shows everything again.
  const activeFilter = filter && (filter === "none" ? unheld : legend.some((f) => f.id === filter)) ? filter : undefined;
  const shown = pinsShown(map.pins, activeFilter, factions);

  const setPins = (pins: MapPin[]) => onChange?.({ ...map, pins });
  const addPin = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable) return;
    const box = e.currentTarget.getBoundingClientRect();
    const next: MapPin = { id: makePinId(), name: `Place ${map.pins.length + 1}`, x: clampPercent(((e.clientX - box.left) / box.width) * 100), y: clampPercent(((e.clientY - box.top) / box.height) * 100) };
    setPins([...map.pins, next]);
    setSelected(next.id);
  };
  const toggleFilter = (id: string) => setFilter((f) => (f === id ? undefined : id));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role={editable ? "button" : "img"}
        tabIndex={editable ? 0 : undefined}
        aria-label={editable ? "World map: click to add a place" : here ? `World map, you are at ${here.name}` : "World map"}
        onClick={addPin}
        className={cn("relative w-full overflow-hidden rounded-xl border border-border/60 bg-muted", editable && "cursor-crosshair")}
      >
        <DisplayImage srcContext={map.image} alt="Map" className="block w-full select-none" draggable={false} />
        {shown.map((p) => {
          const isHere = p.id === hereId;
          const faction = factionOfPin(p, factions);
          const color = !isHere && p.id !== selected ? factionColor(faction?.id, factions) : undefined;
          return (
            <button
              key={p.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (editable) setSelected(p.id);
              }}
              aria-label={`${p.name}${faction ? `, ${faction.name}` : ""}${isHere ? " (you are here)" : ""}`}
              title={faction ? `${p.name} (${faction.name})` : p.name}
              className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              {isHere && <span className="mb-0.5 rounded bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground whitespace-nowrap">You are here</span>}
              <FaMapMarkerAlt size={isHere ? 22 : 16} aria-hidden style={color ? { color } : undefined} className={cn("drop-shadow", isHere ? "text-primary" : p.id === selected ? "text-amber-400" : !color && "text-rose-500")} />
              <span className="mt-0.5 rounded bg-background/85 px-1 text-[10px] font-medium text-foreground whitespace-nowrap">{p.name}</span>
            </button>
          );
        })}
      </div>
      {legend.length > 0 && (
        <div role="group" aria-label="Factions on the map" className="flex flex-wrap items-center gap-1.5">
          {legend.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={activeFilter === f.id}
              onClick={() => toggleFilter(f.id)}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-foreground", activeFilter === f.id ? "border-primary bg-primary/10" : "border-border/60")}
            >
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: factionColor(f.id, factions) }} />
              {f.name}
            </button>
          ))}
          {unheld && (
            <button
              type="button"
              aria-pressed={activeFilter === "none"}
              onClick={() => toggleFilter("none")}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-foreground", activeFilter === "none" ? "border-primary bg-primary/10" : "border-border/60")}
            >
              <span aria-hidden className="h-2 w-2 rounded-full bg-rose-500" />
              No faction
            </button>
          )}
          <span className="text-[11px] text-subtle">{activeFilter ? "Tap again to show every place." : "Tap one to show only its places."}</span>
        </div>
      )}
      {editable && pin && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Place name"
            value={pin.name}
            onChange={(e) => setPins(map.pins.map((p) => (p.id === pin.id ? { ...p, name: e.target.value } : p)))}
            className="h-8 text-[13px] flex-1 min-w-[140px]"
          />
          {factions.length > 0 && (
            <Select
              aria-label="Whose place"
              value={factionOfPin(pin, factions)?.id || ""}
              onChange={(e) => setPins(map.pins.map((p) => (p.id === pin.id ? { ...p, factionId: e.target.value || undefined } : p)))}
              className="h-8 w-auto min-w-[140px] text-[13px]"
            >
              <option value="">No faction</option>
              {factions.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          )}
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Remove ${pin.name}`} onClick={() => { setPins(map.pins.filter((p) => p.id !== pin.id)); setSelected(null); }}>
            <FaTimes size={11} />
          </Button>
        </div>
      )}
      {editable && <p className="text-xs text-subtle">Click the map to pin a place; click a pin to rename it, give it to a faction or remove it. A place whose name the story uses shows as "you are here".</p>}
    </div>
  );
};
