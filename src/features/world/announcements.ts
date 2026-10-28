import { Character, World, WorldAnnouncement } from "../../types";

// World announcements (the user's ask, 2026-10-28): god mode at the world
// level. In a chat, god mode quietly changes a fact and nobody remarks on
// it. An announcement is the opposite: it's news the author declares to the
// whole world, everyone hears it, and each of them takes it in their own
// way - one is thrilled, one is scared, one plans to profit. That take is
// asked for once, per person, and every prompt about them carries it, so
// they keep following it as themselves.

const DAY = 24 * 60 * 60 * 1000;
export const MAX_ANNOUNCEMENTS = 30;
// While it's this fresh it's news people bring up; after, it's how things are.
export const FRESH_DAYS = 7;
// How many people one call asks about, so a reply stays short enough to parse.
export const TAKES_PER_CALL = 8;

export const newAnnouncementId = (now: number) => `an-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const addAnnouncement = (list: WorldAnnouncement[] | undefined, a: WorldAnnouncement): WorldAnnouncement[] => [...(list || []), a].slice(-MAX_ANNOUNCEMENTS);

export const removeAnnouncement = (list: WorldAnnouncement[] | undefined, id: string): WorldAnnouncement[] | undefined => {
  const next = (list || []).filter((a) => a.id !== id);
  return next.length ? next : undefined;
};

// Merges takes into the announcement they're about; others are untouched.
export const withTakes = (list: WorldAnnouncement[] | undefined, id: string, takes: Record<number, string>): WorldAnnouncement[] | undefined =>
  list?.map((a) => (a.id === id ? { ...a, takes: { ...(a.takes || {}), ...takes } } : a));

const about = (c: Pick<Character, "description" | "prompt" | "about">) => [c.about, c.description, c.prompt].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 280);

// One call for a handful of people: how each takes the news and what they do.
export const buildTakesPrompt = (world: Pick<World, "name" | "premise" | "tone">, text: string, people: Pick<Character, "name" | "description" | "prompt" | "about">[]) =>
  [
    `${world.name}: ${world.premise}${world.tone ? ` Tone: ${world.tone}.` : ""}`,
    `It has just been announced to everyone in ${world.name}, and it is real: ${text}`,
    "Everyone here hears it. For each person below, say how they take it and what they mean to do about it, true to who they are. They needn't agree with each other or like it; they don't doubt it's real.",
    ...people.map((p) => `- ${p.name}: ${about(p) || "(no details)"}`),
    "Answer with one line per person, nothing else, in this form:",
    "NAME :: how they take it and what they'll do, in one sentence, in the second person (\"You...\") :: a short status they post about it in their own voice, or - for none",
  ].join("\n");

const clean = (s: string | undefined) => s?.trim().replace(/^["'“]|["'”]$/g, "").trim();

export const parseTakes = (reply: string, people: Pick<Character, "id" | "name">[]) => {
  const takes: Record<number, string> = {};
  const statuses: Record<number, string> = {};
  for (const line of reply.split("\n")) {
    const parts = line.replace(/^[\s*_-]+/, "").split("::");
    if (parts.length < 2) continue;
    const name = clean(parts[0])?.replace(/\*+/g, "").toLowerCase();
    const who = people.find((p) => p.name.toLowerCase() === name) || people.find((p) => name && p.name.split(/\s+/)[0].toLowerCase() === name.split(/\s+/)[0]);
    const take = clean(parts[1]);
    if (!who || !take || takes[who.id]) continue;
    takes[who.id] = take.slice(0, 300);
    const status = clean(parts[2]);
    if (status && status !== "-" && status.length > 1) statuses[who.id] = status.slice(0, 200);
  }
  return { takes, statuses };
};

const ago = (at: number, now: number) => {
  const days = Math.floor((now - at) / DAY);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

// For a reply: what's been announced, and how this person took it.
// `characterId` left out (a group's shared notes) gives the news alone.
export const buildAnnouncementsNote = (world: Pick<World, "name" | "announcements"> | undefined, characterId: number | undefined, now: number): string | undefined => {
  const list = world?.announcements || [];
  if (!list.length) return undefined;
  const lines = list.slice(-10).map((a) => {
    const take = characterId !== undefined ? a.takes?.[characterId] : undefined;
    const fresh = now - a.at < FRESH_DAYS * DAY;
    return `- ${a.text} (announced ${ago(a.at, now)}${fresh ? ", still the news everyone's talking about" : ""})${take ? `. How you took it: ${take}` : ""}`;
  });
  return `Announced to everyone in ${world!.name} by the author. It is real and everyone knows it. Live with it as yourself: let it change what you say and do in your own way, and when it fits, talk about it like news you've heard, reacting as you would.\n${lines.join("\n")}`;
};

// One line for prompts about several people, or about the world; with
// `people`, how each of them took it, so a talk between two keeps to both.
export const announcementsLine = (world: Pick<World, "announcements"> | undefined, people: Pick<Character, "id" | "name">[] = []): string => {
  const list = world?.announcements?.slice(-6) || [];
  if (!list.length) return "";
  const bare = (s: string) => s.trim().replace(/[.!]+$/, "");
  const takes = list.flatMap((a) => people.flatMap((p) => (p.id !== undefined && a.takes?.[p.id] ? [`${p.name} on "${bare(a.text)}": ${bare(a.takes[p.id]).replace(/^You\b/, "they")}`] : [])));
  return `Announced to everyone there, and real: ${list.map((a) => bare(a.text)).join("; ")}.${takes.length ? ` How they took it: ${takes.join("; ")}.` : ""}`;
};
