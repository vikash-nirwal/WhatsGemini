import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FaChevronDown, FaChevronUp, FaWaveSquare } from "react-icons/fa";
import { loadTimeline, onTimeline, TimelineEntry } from "src/features/world/timeline";
import { pulseItems } from "src/features/world/pulse";
import { useCurrentWorld, useWorldCharacters, useWorldPrefs } from "src/hooks/useWorld";
import { formatRelativeTime } from "src/utils/formatRelativeTime";

const seenKey = (worldId: number | null) => `world_pulse_seen_${worldId ?? "mine"}`;
const readSeen = (worldId: number | null) => {
  try {
    return Number(localStorage.getItem(seenKey(worldId))) || 0;
  } catch {
    return 0;
  }
};

// The world pulse (#175): what happened in this world over the last day, on
// top of the chat list. Folded to one line with what's new since you last
// opened it; open, each item goes where it happened.
export const WorldPulse = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { currentWorldId, name } = useCurrentWorld();
  const characters = useWorldCharacters();
  const [prefs] = useWorldPrefs(currentWorldId);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readSeen(currentWorldId));
  useEffect(() => {
    let live = true;
    const load = () => void loadTimeline(currentWorldId).then((list) => live && setTimeline(list));
    load();
    setSeen(readSeen(currentWorldId));
    const off = onTimeline(load);
    return () => {
      live = false;
      off();
    };
  }, [currentWorldId]);
  const items = useMemo(() => pulseItems(timeline, characters, { now: Date.now(), peek: Boolean(prefs.peek), worldId: currentWorldId }), [timeline, characters, prefs.peek, currentWorldId]);
  if (!items.length) return null;
  const fresh = items.filter((i) => i.at > seen).length;
  const toggle = () => {
    setOpen((v) => !v);
    if (!open) {
      const now = Date.now();
      try {
        localStorage.setItem(seenKey(currentWorldId), String(now));
      } catch {
        // Storage can be refused; the count just shows again next time.
      }
      setSeen(now);
    }
  };
  return (
    <section aria-label="World pulse" className="mx-2 mb-2 rounded-card bg-raised ring-1 ring-inset ring-border">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <FaWaveSquare size={13} aria-hidden className="flex-none text-primary-text" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-foreground">{name} today{fresh > 0 && <span className="font-normal text-primary-text"> · {fresh} new</span>}</span>
          {!open && <span className="block truncate text-[12.5px] text-muted-foreground">{items[0].text}</span>}
        </span>
        {open ? <FaChevronUp size={11} className="text-subtle" /> : <FaChevronDown size={11} className="text-subtle" />}
      </button>
      {open && (
        <ul aria-label={`What happened in ${name}`} className="flex flex-col gap-0.5 px-1.5 pb-2">
          {items.slice(0, 12).map((i) => {
            const body = (
              <>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-primary-text">{i.label}</span>
                  <span className="flex-none text-[11.5px] text-subtle">{formatRelativeTime(i.at)}</span>
                </span>
                <span className="block text-[13px] leading-[18px] text-foreground">{i.text}</span>
              </>
            );
            return (
              <li key={i.id}>
                {i.to ? <Link to={i.to} onClick={onNavigate} className="block rounded-lg px-2 py-1.5 hover:bg-sunken">{body}</Link> : <div className="px-2 py-1.5">{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default WorldPulse;
