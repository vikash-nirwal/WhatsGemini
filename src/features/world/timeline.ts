import { dbService } from "../../services/dbService";
import { StoryTime } from "../../types";
import { formatStoryDate } from "./storyTime";

// A world's timeline (#161): one history of what happened there - arrivals
// and departures, relationship changes, god-mode changes, time passing,
// events, and now and then the people talking about you. Kept per world in
// the database (My world included), newest last, capped.

export type TimelineKind = "begin" | "arrival" | "departure" | "tie" | "god" | "time" | "event" | "talk" | "you" | "arc";

export interface TimelineEntry {
  id: string;
  at: number;
  kind: TimelineKind;
  text: string;
  storyDate?: string; // the world's own date then, when it keeps one (#147)
  characterIds?: number[];
}

const KEEP = 400;
const keyOf = (worldId: number | null) => `world_timeline_${worldId ?? "mine"}`;
const listeners = new Set<() => void>();

export const loadTimeline = async (worldId: number | null): Promise<TimelineEntry[]> =>
  ((await dbService.getSetting(keyOf(worldId))) as TimelineEntry[] | undefined) || [];

export const appendEntry = (list: TimelineEntry[], entry: TimelineEntry) => [...list, entry].slice(-KEEP);

// Adds one entry. Never throws: a timeline is a record, not the action.
export const logToTimeline = async (
  worldId: number | null,
  entry: { kind: TimelineKind; text: string; characterIds?: number[]; at?: number },
  storyTime?: StoryTime
) => {
  try {
    const at = entry.at ?? Date.now();
    const full: TimelineEntry = {
      id: `tl-${at.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      at,
      kind: entry.kind,
      text: entry.text,
      ...(storyTime ? { storyDate: formatStoryDate(storyTime, at) } : {}),
      ...(entry.characterIds?.length ? { characterIds: entry.characterIds } : {}),
    };
    await dbService.setSetting(keyOf(worldId), appendEntry(await loadTimeline(worldId), full));
    listeners.forEach((l) => l());
  } catch (err) {
    console.warn("Timeline entry not saved (non-fatal):", err);
  }
};

export const onTimeline = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Newest first, in day groups ("Today", "Oct 24") - or story dates.
export const groupTimeline = (entries: TimelineEntry[], now = Date.now()) => {
  const label = (e: TimelineEntry) => {
    if (e.storyDate) return e.storyDate;
    const d = new Date(e.at);
    const today = new Date(now);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === new Date(now - 86_400_000).toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  };
  const groups: { label: string; entries: TimelineEntry[] }[] = [];
  for (const e of [...entries].reverse()) {
    const l = label(e);
    const last = groups[groups.length - 1];
    if (last && last.label === l) last.entries.push(e);
    else groups.push({ label: l, entries: [e] });
  }
  return groups;
};

export const KIND_LABEL: Record<TimelineKind, string> = {
  begin: "Began", arrival: "Arrived", departure: "Left", tie: "Relationship", god: "Made true", time: "Time", event: "Event", talk: "Talk", you: "You", arc: "Storyline",
};
