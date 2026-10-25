// The activity log (#131): what each background job did, for whom, when,
// and roughly what it cost on your key. Kept on this device (the last 300
// entries), read by Settings > Activity log.

export type ActivityKind = "status" | "first-text" | "letter" | "channel" | "profile" | "talk" | "rumor" | "day-log" | "concerns" | "dream" | "other";

export interface ActivityEntry {
  id: string;
  at: number;
  kind: ActivityKind;
  text: string; // "Aria posted a status"
  characterId?: number;
  name?: string; // the character's name, for the row's avatar
  cost?: number; // estimated USD; undefined on a free or local provider
  world?: string; // the character's world (#146); unset in My world
}

export const LS_ACTIVITY_LOG = "activity_log";
const KEEP = 300;
const listeners = new Set<() => void>();

export const loadActivity = (): ActivityEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(LS_ACTIVITY_LOG) || "[]") as ActivityEntry[];
  } catch {
    return [];
  }
};

export const logActivity = (entry: Omit<ActivityEntry, "id" | "at"> & { at?: number }): void => {
  const at = entry.at ?? Date.now();
  const next = [...loadActivity(), { ...entry, at, id: `act-${at.toString(36)}-${Math.random().toString(36).slice(2, 6)}` }].slice(-KEEP);
  try {
    localStorage.setItem(LS_ACTIVITY_LOG, JSON.stringify(next));
  } catch {
    // Only a convenience.
  }
  listeners.forEach((l) => l());
};

export const onActivity = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const startOfDay = (now: number) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Today's entries and their total estimated cost.
export const todaysActivity = (entries: ActivityEntry[], now: number): { count: number; cost: number } => {
  const today = entries.filter((e) => e.at >= startOfDay(now));
  return { count: today.length, cost: today.reduce((sum, e) => sum + (e.cost || 0), 0) };
};

// Newest first, grouped "Last hour", "Earlier today", "Yesterday", "Older".
export const groupActivity = (entries: ActivityEntry[], now: number): { label: string; entries: ActivityEntry[] }[] => {
  const label = (at: number) => (now - at < 60 * 60 * 1000 ? "Last hour" : at >= startOfDay(now) ? "Earlier today" : at >= startOfDay(now) - 24 * 60 * 60 * 1000 ? "Yesterday" : "Older");
  const groups: { label: string; entries: ActivityEntry[] }[] = [];
  for (const e of [...entries].sort((a, b) => b.at - a.at)) {
    const l = label(e.at);
    const last = groups[groups.length - 1];
    if (last?.label === l) last.entries.push(e);
    else groups.push({ label: l, entries: [e] });
  }
  return groups;
};
