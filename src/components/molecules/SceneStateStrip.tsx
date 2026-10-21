import React from "react";
import { FaClock, FaHeart, FaHandshake, FaMapMarkerAlt, FaTshirt } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { SceneState } from "src/types";

// The scene state HUD (#9): a compact strip under the chat header with where
// things stand. Meters are drawn as short bars with their number, so the
// value never depends on color alone.
const Meter = ({ label, icon: Icon, value }: { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; value: number }) => (
  <span className="flex items-center gap-1.5" title={`${label}: ${value} of 100`}>
    <Icon size={10} className="text-muted-foreground" aria-hidden />
    <span className="sr-only">{label}</span>
    <span aria-hidden className="relative h-1.5 w-10 overflow-hidden rounded-full bg-muted">
      <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${value}%` }} />
    </span>
    <span className="tabular-nums text-foreground">{value}</span>
  </span>
);

export const SceneStateStrip = ({ state, terminal = false }: { state?: SceneState; terminal?: boolean }) => {
  const items = [
    state?.location && { icon: FaMapMarkerAlt, label: "Location", text: state.location },
    state?.time && { icon: FaClock, label: "Time", text: state.time },
    state?.outfit && { icon: FaTshirt, label: "Outfit", text: state.outfit },
  ].filter(Boolean) as { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; text: string }[];
  return (
    <div
      role="group"
      aria-label="Scene state"
      className={cn(
        "relative z-[2] flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[11.5px] text-muted-foreground",
        terminal ? "border-b border-border" : "border-b border-border/40 bg-card/80 backdrop-blur"
      )}
    >
      {items.length === 0 && state?.affection == null && state?.trust == null ? (
        <span>The scene's state shows here after the next reply.</span>
      ) : (
        <>
          {items.map((item) => (
            <span key={item.label} className="flex min-w-0 items-center gap-1.5" title={`${item.label}: ${item.text}`}>
              <item.icon size={10} aria-hidden className="flex-shrink-0" />
              <span className="sr-only">{item.label}:</span>
              <span className="max-w-[11rem] truncate text-foreground">{item.text}</span>
            </span>
          ))}
          {state?.affection != null && <Meter label="Affection" icon={FaHeart} value={state.affection} />}
          {state?.trust != null && <Meter label="Trust" icon={FaHandshake} value={state.trust} />}
        </>
      )}
    </div>
  );
};
