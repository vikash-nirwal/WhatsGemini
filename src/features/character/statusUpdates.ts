import { lifeScaled } from "../life/lifeDial";
import { Character, CharacterStatus } from "../../types";

// Status updates (#8): like WhatsApp Status, a character with statuses on
// now and then posts a short update about their day (from their routine,
// #7, and what they remember), shown for a day as a ring around their
// avatar. Replying to one opens their chat with the status quoted.

export const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const STATUS_GAP_MS = 10 * 60 * 60 * 1000; // at most one every 10 hours of a 24-hour day
const KEEP = 10;
const HOUR = 60 * 60 * 1000;

// How long a status lasts (#140): one "day", and you set how long a day is,
// 1 to 24 hours (Settings › Chat). Kept on this device, like the reading
// settings. Character statuses, yours and the Feed all follow it, and the
// gap between a character's statuses shrinks with it.
export const LS_STATUS_DAY_HOURS = "status_day_hours";
export const DEFAULT_STATUS_DAY_HOURS = 24;
export const clampDayHours = (hours: number): number => (Number.isFinite(hours) ? Math.min(24, Math.max(1, Math.round(hours))) : DEFAULT_STATUS_DAY_HOURS);
export const loadStatusDayHours = (): number => {
  try {
    const raw = localStorage.getItem(LS_STATUS_DAY_HOURS);
    return raw ? clampDayHours(Number(raw)) : DEFAULT_STATUS_DAY_HOURS;
  } catch {
    return DEFAULT_STATUS_DAY_HOURS;
  }
};
export const saveStatusDayHours = (hours: number): void => {
  try {
    localStorage.setItem(LS_STATUS_DAY_HOURS, String(clampDayHours(hours)));
  } catch {
    // Only a convenience.
  }
};
export const statusLifetimeMs = (hours: number = loadStatusDayHours()): number => clampDayHours(hours) * HOUR;

export const liveStatuses = (character: Pick<Character, "statuses">, now: number, lifetime: number = statusLifetimeMs()): CharacterStatus[] =>
  (character.statuses || []).filter((s) => now - s.createdAt < lifetime);

export const hasUnseenStatus = (character: Pick<Character, "statuses">, now: number, lifetime: number = statusLifetimeMs()): boolean =>
  liveStatuses(character, now, lifetime).some((s) => !s.seen);

export const statusDue = (character: Pick<Character, "postsStatuses" | "statuses">, now: number, lifetime: number = statusLifetimeMs()): boolean => {
  if (!character.postsStatuses) return false;
  const latest = (character.statuses || []).reduce((t, s) => Math.max(t, s.createdAt), 0);
  return now - latest >= lifeScaled(STATUS_GAP_MS) * (lifetime / STATUS_LIFETIME_MS);
};

// `mention`: the user's name, when this status should mention them (#129).
// `timeline`: the time now, and their latest messages with the user, so a
// status never posts a plan that already happened as still ahead.
export interface StatusTimeline {
  now?: number;
  userName?: string;
  recentChat?: string;
  worldEvents?: string; // world events going on (#162)
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const nowLine = (now: number): string => {
  const d = new Date(now);
  return `It's ${WEEKDAYS[d.getDay()]}, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} right now.`;
};

export const buildStatusPrompt = (character: Pick<Character, "name" | "description" | "prompt">, nowDoing: string | undefined, facts: string[], recent: string[], dayMood?: string, dayLog?: string, concerns?: string, place?: string, mention?: string, timeline: StatusTimeline = {}): string =>
  `Write one short status update that ${character.name} posts for their friends to see, like a WhatsApp Status.
${timeline.now ? `${nowLine(timeline.now)}\n` : ""}
About ${character.name}: ${[character.description, character.prompt].filter(Boolean).join(" ").slice(0, 600)}
${nowDoing ? `Right now they're ${nowDoing}.\n` : ""}${dayMood ? `Today they're ${dayMood}, and it shows.\n` : ""}${dayLog ? `Their day so far (keep to it): ${dayLog}\n` : ""}${concerns ? `On their mind lately: ${concerns}\n` : ""}${place ? `Where they are: ${place}\n` : ""}${timeline.worldEvents ? `Going on in their world right now (they may post about it): ${timeline.worldEvents}\n` : ""}${facts.length > 0 ? `Things going on in their life lately:\n- ${facts.slice(0, 8).join("\n- ")}\n` : ""}${recent.length > 0 ? `Their last statuses (don't repeat them):\n- ${recent.join("\n- ")}\n` : ""}${timeline.recentChat ? `Their latest messages with ${timeline.userName || "the user"} (all of this has already happened):\n${timeline.recentChat}\n` : ""}
- Keep to the timeline: what's in their messages, or dated in the past, has already happened. Never post about a plan, trip or meeting as still ahead (or on the way to it) once it has taken place.
- First person, in ${character.name}'s own voice, about their day, a mood, a small moment or something they're looking forward to.
${mention ? `- This time, mention ${mention} in it as @${mention}: something you did together, are planning, or a thought about them.\n` : ""}- At most 140 characters. One emoji is fine. No hashtags, no quotes, no mention of being an AI.
- Reply with only the status text.`;

export const cleanStatus = (reply: string): string | undefined => {
  const text = reply.trim().split("\n").filter(Boolean)[0]?.replace(/^(status|update)\s*:\s*/i, "").replace(/^["“']|["”']$/g, "").trim();
  if (!text) return undefined;
  return text.length > 200 ? `${text.slice(0, 197).trimEnd()}...` : text;
};

export const addStatus = (statuses: CharacterStatus[] | undefined, status: CharacterStatus): CharacterStatus[] => [...(statuses || []), status].slice(-KEEP);

export const markSeen = (statuses: CharacterStatus[] | undefined): CharacterStatus[] | undefined => statuses?.map((s) => (s.seen ? s : { ...s, seen: true }));

// Photo statuses (#118): with the switch on, every other status comes with
// a picture, drawn on the image provider with the character's locked look.
export const photoStatusDue = (character: Pick<Character, "statusPhotos" | "statuses">): boolean => {
  if (!character.statusPhotos) return false;
  const last = (character.statuses || [])[(character.statuses || []).length - 1];
  return !last?.image;
};

// What the picture shows, worded as a scene for the illustrator.
export const statusPhotoScene = (name: string, text: string): string =>
  `${name} posts a photo with their status: "${text}". It's a casual phone photo they took themselves: a selfie of ${name}, or what they're looking at right now, whichever fits the status.`;

// Status mentions (#129): the status tags you as @YourName.
export const mentionsUser = (text: string, userName: string): boolean => {
  const name = userName.trim();
  if (!name) return false;
  return new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text);
};
