import { Character } from "../../types";
import { KIND_LABEL, TimelineEntry } from "./timeline";

// The world pulse (#175): what happened in the world you're in over the
// last day, at the top of Chats. Before it, a living world looked the same
// as a dead one unless you opened the timeline, followed the news channel
// or turned on Peek. Timeline entries plus their own texts to each other.

const DAY = 24 * 60 * 60 * 1000;

export interface PulseItem {
  id: string;
  at: number;
  label: string; // "Event", "Talk", ...
  text: string;
  to?: string; // where tapping it goes
  characterIds?: number[];
}

export const pulseItems = (
  timeline: TimelineEntry[],
  characters: Pick<Character, "id" | "name" | "talks">[],
  { now, peek, worldId, windowMs = DAY }: { now: number; peek: boolean; worldId: number | null; windowMs?: number }
): PulseItem[] => {
  const recent = (at: number) => at <= now && now - at < windowMs;
  const fromTimeline: PulseItem[] = timeline.filter((e) => recent(e.at)).map((e) => ({
    id: e.id, at: e.at, label: KIND_LABEL[e.kind], text: e.text, characterIds: e.characterIds, to: `/worlds/${worldId ?? "mine"}/timeline`,
  }));
  const nameOf = (id: number) => characters.find((c) => c.id === id)?.name;
  const talks: PulseItem[] = characters.flatMap((holder) =>
    (holder.talks || []).filter((t) => t.lines.length && recent(t.at) && nameOf(t.withId)).map((t) => ({
      id: `talk-${holder.id}-${t.id}`,
      at: t.at,
      label: "Texts",
      text: `${holder.name} and ${nameOf(t.withId)} texted${peek ? "" : " (turn on Peek to read)"}`,
      characterIds: [holder.id, t.withId],
      ...(peek ? { to: `/peek/${holder.id}/${t.withId}` } : {}),
    }))
  );
  // A talk about you is already in the timeline; don't show it twice.
  const said = new Set(fromTimeline.filter((i) => i.label === KIND_LABEL.talk).map((i) => i.characterIds?.slice().sort().join("-")));
  return [...fromTimeline, ...talks.filter((t) => !said.has(t.characterIds?.slice().sort().join("-")))].sort((a, b) => b.at - a.at);
};
