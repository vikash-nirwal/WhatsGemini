import { lifeScaled } from "../life/lifeDial";
import { Character, CharacterDayLog } from "../../types";
import { dayKey } from "./badDays";

// One consistent day (#107): with the switch on, the helper model writes once
// a day what the character's day has actually been like (where they went, who
// they ran into, one small thing that happened), from their routine (#7),
// today's mood (#95) and memory. Every prompt and generator - replies,
// statuses (#8), first texts (#93) - gets the same account, so they stop
// contradicting each other. Cached on the character for the day.

export const dayLogFor = (character: Pick<Character, "dayLog"> | undefined, now: number): CharacterDayLog | undefined =>
  character?.dayLog?.date === dayKey(now) ? character.dayLog : undefined;

// Today's text, when there is one worth using.
export const dayLogText = (character: Pick<Character, "dayLog"> | undefined, now: number): string | undefined =>
  dayLogFor(character, now)?.text || undefined;

// Due once a day, from mid-morning on, so the day has had a chance to start.
// A log saved empty (the model gave nothing usable) counts as written, so a
// failing model isn't asked again all day.
export const DAY_LOG_FROM_HOUR = 9;

// Rewritten every six hours while the day goes on (until 10 pm), so what
// was "still ahead" in the morning moves into the past instead of staying
// the one true account all day.
export const DAY_LOG_REFRESH_MS = 6 * 60 * 60 * 1000;
const DAY_LOG_UNTIL_HOUR = 22;

export const dayLogDue = (character: Pick<Character, "dayLogs" | "dayLog"> | undefined, now: number): boolean => {
  if (!character?.dayLogs) return false;
  const hour = new Date(now).getHours();
  if (hour < DAY_LOG_FROM_HOUR) return false;
  const today = dayLogFor(character, now);
  if (!today) return true;
  return Boolean(today.text) && hour < DAY_LOG_UNTIL_HOUR && now - (today.writtenAt || 0) >= lifeScaled(DAY_LOG_REFRESH_MS);
};

export interface DayLogContext {
  routine?: string; // the schedule section (#7), if they have a routine
  dayMood?: string; // bad days (#95): "under the weather"
  facts: string[];
  yesterday?: string; // yesterday's log, for a thread between days
  earlier?: string; // today's earlier account, when it's being brought up to date
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const timeOfDay = (hour: number): string => (hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night");

export const buildDayLogPrompt = (character: Pick<Character, "name" | "description" | "prompt">, now: number, ctx: DayLogContext): string => {
  const d = new Date(now);
  return `Write what ${character.name}'s day has been like so far today (${WEEKDAYS[d.getDay()]} ${timeOfDay(d.getHours())}), and how the rest of it looks.

About ${character.name}: ${[character.description, character.prompt].filter(Boolean).join(" ").slice(0, 600)}
${ctx.routine ? `${ctx.routine}\n` : ""}${ctx.dayMood ? `Today they're ${ctx.dayMood}, and it shows.\n` : ""}${ctx.yesterday ? `Yesterday: ${ctx.yesterday}\n` : ""}${ctx.earlier ? `Earlier today it went like this: ${ctx.earlier}\nBring it up to date: keep what already happened, move what was still ahead into the past if its time has come, and say what's ahead now.\n` : ""}${ctx.facts.length > 0 ? `Things going on in their life lately:\n- ${ctx.facts.slice(0, 8).join("\n- ")}\n` : ""}
- Three or four short sentences, third person, present tense ("${character.name} ...").
- Where they went or are, who they ran into or talked to, one small concrete thing that happened (good, dull or annoying), and what's still ahead today.
- Ordinary, specific and in keeping with their routine and world. Nothing dramatic, nothing about the person they text.
- Reply with only the text.`;
};

export const cleanDayLog = (reply: string): string | undefined => {
  const text = reply.trim().replace(/^```[a-z]*\s*|```\s*$/gi, "").trim().replace(/^["“]|["”]$/g, "").replace(/\s*\n\s*/g, " ").trim();
  if (text.length < 20) return undefined;
  return text.length > 700 ? `${text.slice(0, 697).trimEnd()}...` : text;
};

// The prompt's note: the one true account of their day.
export const buildDayLogSection = (name: string, text: string | undefined): string | undefined =>
  text
    ? `What ${name}'s day has actually been like today: ${text} This is the one true account of ${name}'s day: keep to it in replies, don't contradict or reinvent it, and bring up bits of it only when they fit.`
    : undefined;
