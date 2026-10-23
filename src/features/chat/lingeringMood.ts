import { ChatMood } from "../../types";

// Moods that carry over (#106): with the switch on, what the character felt
// in a reply (its emotion tag) stays with them for a few hours and colours
// the next replies, fading one step every FADE_MS of wall-clock time, so the
// morning after a row still feels like the morning after. A fight (#97)
// covers the one case of being upset *with you*; this is everything else -
// hurt, shaken, embarrassed, or still buzzing from good news. Nothing is
// asked of the model beyond the emotion tag it already reports.

// How a reported emotion lingers, if it does. Neutral, thinking, surprised and
// shy pass: they're reactions to the moment, not moods. Negative feelings
// start stronger (hurt lasts longer than joy) and take more lifting.
const LINGERING: Record<string, { feeling: string; negative: boolean }> = {
  angry: { feeling: "angry", negative: true },
  annoyed: { feeling: "annoyed", negative: true },
  sad: { feeling: "sad", negative: true },
  scared: { feeling: "shaken", negative: true },
  embarrassed: { feeling: "embarrassed", negative: true },
  happy: { feeling: "happy", negative: false },
  excited: { feeling: "excited", negative: false },
  flirty: { feeling: "flirty", negative: false },
  smug: { feeling: "pleased with themselves", negative: false },
};

export const FADE_MS = 3 * 60 * 60 * 1000;
const MAX_INTENSITY = 3;

// The mood as it stands now: one step weaker for every FADE_MS since it was
// last felt, gone once it reaches nothing.
export const fadedMood = (mood: ChatMood | undefined, now: number): ChatMood | undefined => {
  if (!mood) return undefined;
  const steps = Math.floor(Math.max(0, now - mood.updatedAt) / FADE_MS);
  const intensity = mood.intensity - steps;
  if (intensity <= 0) return undefined;
  return intensity === mood.intensity ? mood : { ...mood, intensity: intensity as ChatMood["intensity"] };
};

const clampIntensity = (n: number): ChatMood["intensity"] => Math.max(1, Math.min(MAX_INTENSITY, n)) as ChatMood["intensity"];

// A short, single-line excerpt of what the user said, as the mood's cause.
const causeFrom = (userText: string | undefined): string | undefined => {
  const line = userText?.replace(/\s+/g, " ").trim();
  if (!line) return undefined;
  return line.length > 100 ? `${line.slice(0, 97).trimEnd()}...` : line;
};

// What the mood is after a reply that reported `emotion`, given what it was.
// The same feeling again deepens it; a warm reply while they're down lifts it
// a step (and the other way round, a bad turn cuts a good mood short); a new
// feeling replaces the old one. An emotion that doesn't linger leaves the mood
// to fade on its own.
export const moodAfterReply = (current: ChatMood | undefined, emotion: string | undefined, userText: string | undefined, now: number): ChatMood | undefined => {
  const faded = fadedMood(current, now);
  const next = emotion ? LINGERING[emotion.toLowerCase()] : undefined;
  if (!next) return faded;
  if (faded && faded.feeling === next.feeling) {
    return { ...faded, intensity: clampIntensity(faded.intensity + 1), updatedAt: now };
  }
  if (faded) {
    const wasNegative = LINGERING[Object.keys(LINGERING).find((k) => LINGERING[k].feeling === faded.feeling) || ""]?.negative;
    if (wasNegative && !next.negative) {
      // Kindness lifts it a little; it doesn't vanish all at once.
      return faded.intensity > 1 ? { ...faded, intensity: clampIntensity(faded.intensity - 1), updatedAt: now } : undefined;
    }
  }
  return { feeling: next.feeling, intensity: next.negative ? 2 : 1, cause: causeFrom(userText), since: now, updatedAt: now };
};

const ago = (since: number, now: number): string => {
  const minutes = Math.max(1, Math.round((now - since) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
};

const HOW_MUCH: Record<ChatMood["intensity"], string> = {
  3: "still very much there",
  2: "still noticeably there",
  1: "mostly faded, but a trace is left",
};

// The prompt's note. Takes the mood as it stands (fadedMood).
export const buildMoodSection = (name: string, mood: ChatMood, userName: string, now: number): string =>
  `Earlier (${ago(mood.since, now)}) ${name} was ${mood.feeling}${mood.cause ? `, after ${userName} said: "${mood.cause}"` : ""}. It's ${HOW_MUCH[mood.intensity]}. Let it colour the tone and energy of the reply the way a real mood would - don't restate it or make it the topic unless it fits, don't pretend it never happened either. It keeps fading as the conversation goes on${mood.intensity > 1 ? `, and warmth from ${userName} helps` : ""}.`;

// The Scene panel's one-line summary: "Still a bit sad · since 2 hours ago".
export const describeMood = (mood: ChatMood, now: number): string => {
  const how = mood.intensity === 3 ? "Still very" : mood.intensity === 2 ? "Still" : "Still a bit";
  return `${how} ${mood.feeling} · since ${ago(mood.since, now)}`;
};
