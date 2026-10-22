import React, { useState } from "react";
import { FaMapMarkerAlt, FaTimes } from "react-icons/fa";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import { MapPin, WorldMap } from "src/types";
import { clampPercent, makePinId } from "src/features/world/worldMap";
import { cn } from "src/utils/cn";

interface WorldMapViewProps {
  map: WorldMap;
  hereId?: string; // the pin shown as "you are here"
  onChange?: (map: WorldMap) => void; // editable when given: click the map to add a pin
  className?: string;
}

// A World's map (#66) with its pins. In the editor, clicking the picture
// drops a pin there and clicking a pin selects it to rename or remove.
export const WorldMapView: React.FC<WorldMapViewProps> = ({ map, hereId, onChange, className }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const editable = Boolean(onChange);
  const pin = map.pins.find((p) => p.id === selected);
  const here = map.pins.find((p) => p.id === hereId);

  const setPins = (pins: MapPin[]) => onChange?.({ ...map, pins });
  const addPin = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable) return;
    const box = e.currentTarget.getBoundingClientRect();
    const next: MapPin = { id: makePinId(), name: `Place ${map.pins.length + 1}`, x: clampPercent(((e.clientX - box.left) / box.width) * 100), y: clampPercent(((e.clientY - box.top) / box.height) * 100) };
    setPins([...map.pins, next]);
    setSelected(next.id);
  };

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
        {map.pins.map((p) => {
          const isHere = p.id === hereId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (editable) setSelected(p.id);
              }}
              aria-label={isHere ? `${p.name} (you are here)` : p.name}
              title={p.name}
              className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              {isHere && <span className="mb-0.5 rounded bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground whitespace-nowrap">You are here</span>}
              <FaMapMarkerAlt size={isHere ? 22 : 16} aria-hidden className={cn("drop-shadow", isHere ? "text-primary" : p.id === selected ? "text-amber-400" : "text-rose-500")} />
              <span className="mt-0.5 rounded bg-background/85 px-1 text-[10px] font-medium text-foreground whitespace-nowrap">{p.name}</span>
            </button>
          );
        })}
      </div>
      {editable && pin && (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Place name"
            value={pin.name}
            onChange={(e) => setPins(map.pins.map((p) => (p.id === pin.id ? { ...p, name: e.target.value } : p)))}
            className="h-8 text-[13px]"
          />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Remove ${pin.name}`} onClick={() => { setPins(map.pins.filter((p) => p.id !== pin.id)); setSelected(null); }}>
            <FaTimes size={11} />
          </Button>
        </div>
      )}
      {editable && <p className="text-xs text-subtle">Click the map to pin a place; click a pin to rename or remove it. A place whose name the story uses shows as "you are here".</p>}
    </div>
  );
};
