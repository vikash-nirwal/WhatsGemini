import React from "react";
import { FaChartBar, FaClock, FaHeart, FaHandshake, FaMapMarkerAlt, FaTshirt, FaUsers } from "react-icons/fa";
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

// `meters`: a chat's own meters (#71), shown in place of affection and trust.
export const SceneStateStrip = ({ state, terminal = false, meters }: { state?: SceneState; terminal?: boolean; meters?: string[] }) => {
  const custom = meters && meters.length > 0;
  const items = [
    state?.location && { icon: FaMapMarkerAlt, label: "Location", text: state.location },
    state?.time && { icon: FaClock, label: "Time", text: state.time },
    state?.outfit && { icon: FaTshirt, label: "Outfit", text: state.outfit },
    // Group chats (#69): who's in the scene.
    state?.present && { icon: FaUsers, label: "Here", text: state.present.length > 0 ? state.present.join(", ") : "nobody" },
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
      {items.length === 0 && (custom ? !meters!.some((m) => state?.meters?.[m.toLowerCase()] != null) : state?.affection == null && state?.trust == null) ? (
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
          {custom
            ? meters!.map((m) => {
                const v = state?.meters?.[m.toLowerCase()];
                return v != null ? <Meter key={m} label={m.charAt(0).toUpperCase() + m.slice(1)} icon={FaChartBar} value={v} /> : null;
              })
            : (
              <>
                {state?.affection != null && <Meter label="Affection" icon={FaHeart} value={state.affection} />}
                {state?.trust != null && <Meter label="Trust" icon={FaHandshake} value={state.trust} />}
              </>
            )}
        </>
      )}
    </div>
  );
};
