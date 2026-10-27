import { dbService } from "../../services/dbService";
import { StoryTime } from "../../types";
import { formatStoryDate } from "./storyTime";
import { knowsEntry } from "./knowledge";

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
  // Who can know it (#203): public (everyone in the world), private (the
  // people in it), secret (only those it was told to, never passed on).
  // Left out on older entries, which knowledge.ts reads by kind.
  audience?: "public" | "private" | "secret";
  knownBy?: number[]; // who knows it first-hand, when not everyone it's about (characterIds) does
  heard?: { id: number; from: number; at: number }[]; // who heard it, and from whom (#206)
  folded?: number[]; // whose memory of it was folded into a shorter line (#207)
}

const KEEP = 400;
const keyOf = (worldId: number | null) => `world_timeline_${worldId ?? "mine"}`;
const listeners = new Set<() => void>();

// The last list read or written per world, so prompts built on the spot
// (which can't wait for the database) can recall the history (#179).
const cache = new Map<string, TimelineEntry[]>();

export const loadTimeline = async (worldId: number | null): Promise<TimelineEntry[]> => {
  const list = ((await dbService.getSetting(keyOf(worldId))) as TimelineEntry[] | undefined) || [];
  cache.set(keyOf(worldId), list);
  return list;
};

export const cachedTimeline = (worldId: number | null): TimelineEntry[] => cache.get(keyOf(worldId)) || [];

export const appendEntry = (list: TimelineEntry[], entry: TimelineEntry) => [...list, entry].slice(-KEEP);

// Writes to one world's timeline run one at a time: talks now edit
// entries (who heard what), and two read-modify-writes at once would lose one.
const writes = new Map<string, Promise<unknown>>();
const queued = <T>(worldId: number | null, run: () => Promise<T>): Promise<T> => {
  const key = keyOf(worldId);
  const next = (writes.get(key) || Promise.resolve()).catch(() => undefined).then(run);
  writes.set(key, next);
  return next;
};

// Changes entries in place (who heard what, #206). Never throws.
export const editTimeline = (worldId: number | null, change: (list: TimelineEntry[]) => TimelineEntry[]) =>
  queued(worldId, async () => {
    try {
      const next = change(await loadTimeline(worldId));
      await dbService.setSetting(keyOf(worldId), next);
      cache.set(keyOf(worldId), next);
      listeners.forEach((l) => l());
    } catch (err) {
      console.warn("Timeline not updated (non-fatal):", err);
    }
  });

// Adds one entry. Never throws: a timeline is a record, not the action.
export const logToTimeline = (
  worldId: number | null,
  entry: { kind: TimelineKind; text: string; characterIds?: number[]; at?: number; audience?: TimelineEntry["audience"]; knownBy?: number[] },
  storyTime?: StoryTime
) => queued(worldId, async () => {
  try {
    const at = entry.at ?? Date.now();
    const full: TimelineEntry = {
      id: `tl-${at.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      at,
      kind: entry.kind,
      text: entry.text,
      ...(storyTime ? { storyDate: formatStoryDate(storyTime, at) } : {}),
      ...(entry.characterIds?.length ? { characterIds: entry.characterIds } : {}),
      ...(entry.audience ? { audience: entry.audience } : {}),
      ...(entry.knownBy?.length ? { knownBy: entry.knownBy } : {}),
    };
    const next = appendEntry(await loadTimeline(worldId), full);
    await dbService.setSetting(keyOf(worldId), next);
    cache.set(keyOf(worldId), next);
    listeners.forEach((l) => l());
  } catch (err) {
    console.warn("Timeline entry not saved (non-fatal):", err);
  }
});

// Replaces a world's timeline (undoing a time skip, #189).
export const replaceTimeline = (worldId: number | null, list: TimelineEntry[]) =>
  queued(worldId, async () => {
    await dbService.setSetting(keyOf(worldId), list);
    cache.set(keyOf(worldId), list);
    listeners.forEach((l) => l());
  });

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

// What's happened here (#179): the notable past, for prompts - events,
// chapters, arrivals and departures, lives, time passing, what you made
// true. Their own texts to each other are left out (too many, and they
// carry the latest one anyway). Older than a day, so it reads as history.
const NOTABLE: TimelineKind[] = ["begin", "arrival", "departure", "god", "time", "event", "arc", "you"];
const DAY_MS = 24 * 60 * 60 * 1000;

// With `knower`, only what that character could know (#203): what you did
// with someone else, or a private falling-out, isn't everyone's history.
export const buildHistoryNote = (entries: TimelineEntry[], now: number, max = 8, knower?: number): string | undefined => {
  const past = entries.filter((e) => NOTABLE.includes(e.kind) && now - e.at >= DAY_MS && (knower === undefined || knowsEntry(e, knower))).slice(-max);
  if (!past.length) return undefined;
  const when = (e: TimelineEntry) => e.storyDate || `${Math.round((now - e.at) / DAY_MS)} days ago`;
  return `What's happened in this world before (history you lived through; bring it up when it fits, never as if it's happening now):\n${past.map((e) => `- ${when(e)}: ${e.text}`).join("\n")}`;
};

export const KIND_LABEL: Record<TimelineKind, string> = {
  begin: "Began", arrival: "Arrived", departure: "Left", tie: "Relationship", god: "Made true", time: "Time", event: "Event", talk: "Talk", you: "You", arc: "Storyline",
};
