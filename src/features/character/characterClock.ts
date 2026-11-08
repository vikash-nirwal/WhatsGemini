import { CharacterHome } from "../../types";

// Routines in their own time zone (#249): a character with a home (#112)
// sleeps, works and wakes by the clock where they live, not by yours. Every
// part of their routine that asks "what time is it for them?" asks here;
// without a home (or with a time zone the browser doesn't know) it's your
// local time, as before.

export interface CharacterClock {
  hour: number; // 0-24, with minutes as a fraction (17.5 is 17:30)
  weekday: number; // 0 is Sunday, as Date.getDay()
  dayKey: string; // "2026-01-15", their date
}

const pad = (n: number) => String(n).padStart(2, "0");

const localClock = (now: number): CharacterClock => {
  const d = new Date(now);
  return {
    hour: d.getHours() + d.getMinutes() / 60,
    weekday: d.getDay(),
    dayKey: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  };
};

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Built once per time zone: the routine is asked about on every render of a
// chat and for every character in a world's background turn.
const formatters = new Map<string, Intl.DateTimeFormat | null>();
const formatterFor = (timeZone: string): Intl.DateTimeFormat | null => {
  if (!formatters.has(timeZone)) {
    try {
      formatters.set(timeZone, new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }));
    } catch {
      // An unknown zone (an old browser, a hand-edited card): your time.
      formatters.set(timeZone, null);
    }
  }
  return formatters.get(timeZone) ?? null;
};

export const clockIn = (now: number, timeZone?: string): CharacterClock => {
  const format = timeZone ? formatterFor(timeZone) : null;
  if (!format) return localClock(now);
  const parts: Record<string, string> = {};
  for (const p of format.formatToParts(new Date(now))) parts[p.type] = p.value;
  // Some engines write midnight as 24 even with h23.
  const hour = Number(parts.hour) % 24;
  return {
    hour: hour + Number(parts.minute) / 60,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? new Date(now).getDay(),
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
};

// The time zone a character's routine runs in, if they have a home.
export const zoneOf = (character: { home?: Pick<CharacterHome, "timeZone"> } | undefined): string | undefined =>
  character?.home?.timeZone || undefined;

// The same, straight from a character.
export const characterClock = (character: { home?: Pick<CharacterHome, "timeZone"> } | undefined, now: number): CharacterClock =>
  clockIn(now, zoneOf(character));
