import { WorldArc, World } from "../../types";

// World arcs (#169): a storyline across a whole world - a mystery, a feud,
// a looming storm - in a handful of beats. One beat is under way at a time;
// every couple of story days the next begins (or you move it on), and it
// reaches chats, statuses, the news channel and their talk. You're in it.

const DAY = 24 * 60 * 60 * 1000;
export const BEAT_GAP_MS = 2 * DAY;
const MAX_BEATS = 7;

export const arcActive = (world: Pick<World, "arc"> | undefined): WorldArc | undefined => (world?.arc && !world.arc.doneAt ? world.arc : undefined);

export const nextBeatDue = (arc: WorldArc, now: number, gapMs: number = BEAT_GAP_MS) => !arc.doneAt && now - arc.stepAt >= gapMs;

// The next beat, or the arc's end after the last.
export const advanceArc = (arc: WorldArc, now: number): WorldArc =>
  arc.step + 1 >= arc.beats.length ? { ...arc, doneAt: now } : { ...arc, step: arc.step + 1, stepAt: now };

export const buildArcPrompt = (world: Pick<World, "name" | "premise" | "tone" | "era" | "factions">, cast: string[], userName: string, idea?: string) =>
  [
    `${world.name}: ${world.premise}${world.tone ? ` Tone: ${world.tone}.` : ""}${world.era ? ` Era: ${world.era}.` : ""}`,
    cast.length ? `People here: ${cast.slice(0, 12).join(", ")}.` : "",
    world.factions?.length ? `Groups here: ${world.factions.map((f) => f.name).join(", ")} - the story can turn on them.` : "",
    idea?.trim() ? `The author's idea for it: ${idea.trim()}` : "Invent one: a mystery, a feud, a romance, a threat, a scheme - something the whole world gets caught up in.",
    `Write a storyline that unfolds across this world over a few weeks, in 4 to 6 beats. Each beat is what happens next, one or two sentences, naming people. ${userName} is part of it: leave room for them to act, never decide what they do.`,
    "Answer only with:",
    "TITLE: <a short name>",
    "BEAT: <first beat>",
    "BEAT: <next beat>",
    "...",
  ].filter(Boolean).join("\n");

export const parseArc = (reply: string, now: number): WorldArc | undefined => {
  const clean = (s: string) => s.replace(/[*_]/g, "").trim().replace(/^["']|["']$/g, "").trim();
  const title = reply.match(/^[\s*_-]*TITLE\s*:\s*(.+)$/im)?.[1];
  const beats = Array.from(reply.matchAll(/^[\s*_-]*BEAT(?:\s*\d+)?\s*:\s*(.+)$/gim)).map((m) => clean(m[1])).filter(Boolean).slice(0, MAX_BEATS);
  if (!title || beats.length < 2) return undefined;
  return { title: clean(title).slice(0, 80), beats: beats.map((b) => b.slice(0, 400)), step: 0, startedAt: now, stepAt: now };
};

// For prompts in the world: the story so far and the beat under way.
export const buildArcNote = (arc: WorldArc | undefined, userName: string): string | undefined => {
  if (!arc || arc.doneAt) return undefined;
  const past = arc.beats.slice(0, arc.step);
  return [
    `A storyline is unfolding in this world: "${arc.title}".`,
    past.length ? `So far: ${past.join(" ")}` : "",
    `Happening now: ${arc.beats[arc.step]}`,
    `You know what anyone here would; it's on your mind and can come up. ${userName} is part of it: draw them in naturally, but don't decide what they do, and don't jump ahead of what's happening now.`,
  ].filter(Boolean).join("\n");
};

export const arcLine = (arc: WorldArc | undefined) => (arc && !arc.doneAt ? `${arc.title}: ${arc.beats[arc.step]}` : undefined);
