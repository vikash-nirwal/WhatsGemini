import { World, WorldEvent } from "../../types";

// World events (#162): now and then something happens to a whole world - a
// festival, a storm, a scandal - and for a few days everyone there lives
// with it: it's in their chats, statuses, the news channel and their talk.
// You can start one yourself; the world starts its own every few days.

const DAY = 24 * 60 * 60 * 1000;
const KEEP = 20;
export const EVENT_GAP_MS = 4 * DAY;
export const MAX_EVENT_DAYS = 14;

export const newEventId = () => `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const activeEvents = (world: Pick<World, "events"> | undefined, now: number): WorldEvent[] => (world?.events || []).filter((e) => e.at <= now && now < e.endsAt);

export const addEvent = (events: WorldEvent[] | undefined, event: WorldEvent): WorldEvent[] => [...(events || []), event].slice(-KEEP);

export const endEvent = (events: WorldEvent[] | undefined, id: string, now: number): WorldEvent[] => (events || []).map((e) => (e.id === id ? { ...e, endsAt: Math.min(e.endsAt, now) } : e));

// The world starts one of its own when nothing is on, the last one is a
// few days back (scaled by the life dial), and the dice agree - so worlds
// don't all lurch from event to event.
export const eventDue = (world: Pick<World, "events" | "lastEventCheckAt">, now: number, gapMs: number = EVENT_GAP_MS, rand: () => number = Math.random): boolean => {
  if (activeEvents(world, now).length) return false;
  const lastAt = Math.max(0, ...(world.events || []).map((e) => e.endsAt), world.lastEventCheckAt || 0);
  return now - lastAt >= gapMs && rand() < 0.5;
};

export const buildEventIdeaPrompt = (world: Pick<World, "name" | "premise" | "tone" | "era" | "factions">, cast: string[], past: WorldEvent[], idea?: string) =>
  [
    `${world.name}: ${world.premise}${world.tone ? ` Tone: ${world.tone}.` : ""}${world.era ? ` Era: ${world.era}.` : ""}`,
    cast.length ? `People here: ${cast.slice(0, 12).join(", ")}.` : "",
    // Families and factions can be part of it (#185).
    world.factions?.length ? `Groups here: ${world.factions.map((f) => `${f.name} (${f.kind}${f.about ? `, ${f.about}` : ""})`).join("; ")}. An event may involve one of them, or set them against each other.` : "",
    past.length ? `Earlier events (something different this time): ${past.slice(-4).map((e) => e.title).join("; ")}.` : "",
    idea?.trim() ? `The author wants this to happen: ${idea.trim()}` : "Invent one event that happens to this whole world now: a festival, a storm, a scandal, an election, a crime, a fair, a blackout - whatever fits the setting. Something everyone would talk about.",
    "Answer with exactly three lines, nothing else:",
    "TITLE: <a short name, at most 6 words>",
    "WHAT: <one or two sentences: what's happening, as everyone here knows it>",
    "DAYS: <how many days it lasts, 1 to 7>",
  ].filter(Boolean).join("\n");

const field = (reply: string, name: string) => reply.match(new RegExp(`^[\\s*_-]*${name}\\s*:\\s*(.+)$`, "im"))?.[1].trim().replace(/^["']|["']$/g, "").trim();

export const parseEvent = (reply: string, now: number, byYou = false): WorldEvent | undefined => {
  const title = field(reply, "TITLE");
  const text = field(reply, "WHAT");
  if (!title || !text) return undefined;
  const days = Math.min(MAX_EVENT_DAYS, Math.max(1, Math.round(Number(field(reply, "DAYS")?.match(/\d+/)?.[0]) || 3)));
  return { id: newEventId(), title: title.slice(0, 80), text: text.slice(0, 400), at: now, endsAt: now + days * DAY, ...(byYou ? { byYou } : {}) };
};

// For any prompt in the world: what's going on that everyone knows about.
export const buildEventsNote = (events: WorldEvent[]): string | undefined =>
  events.length ? `Happening in this world right now (everyone here knows; it's on people's minds and can come up naturally):\n${events.map((e) => `- ${e.title}: ${e.text}`).join("\n")}` : undefined;

// A one-line version for short prompts (statuses, channel posts).
export const eventsLine = (events: WorldEvent[]): string | undefined => (events.length ? events.map((e) => `${e.title} (${e.text})`).join("; ") : undefined);

export const daysLeft = (event: WorldEvent, now: number) => Math.max(0, Math.ceil((event.endsAt - now) / DAY));
