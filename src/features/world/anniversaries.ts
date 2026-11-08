import { StoryTime, World } from "../../types";
import { DEFAULT_MONTHS, storyParts } from "./storyTime";
import { audienceOf, knowsEntry } from "./knowledge";
import type { TimelineEntry } from "./timeline";

// Anniversaries (#244). A world kept its history, but a festival that went
// wrong or the night you two first kissed only came back if something
// happened to remind someone. Now, a year on, it comes back by itself: a
// short "a year ago today" line where the world's context already reaches
// replies and background prompts, on the world's own calendar when it keeps
// one, else the real one. No model call: the timeline has it all.

const DAY_MS = 24 * 60 * 60 * 1000;
// A few days' grace, so a paused calendar that skipped past the day, or a
// chat opened the day after, still remembers.
const GRACE_DAYS = 3;
const MAX = 2;

// One-off world events and the big moments with you. A tradition held
// again (#222) is its own yearly return, and "… is over" isn't a moment.
const isMoment = (e: TimelineEntry) =>
  (e.kind === "event" || e.kind === "you") && !/As every year\.?$/i.test(e.text) && !/ is over\.?$/i.test(e.text);

interface Since {
  years: number;
  days: number; // days past the anniversary itself
}

// On the real calendar: whole years since, and how many days past the day.
const realSince = (at: number, now: number): Since | undefined => {
  const then = new Date(at);
  const today = new Date(now);
  let years = today.getFullYear() - then.getFullYear();
  let day = new Date(today.getFullYear(), then.getMonth(), then.getDate());
  if (day.getTime() > new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) {
    years -= 1;
    day = new Date(today.getFullYear() - 1, then.getMonth(), then.getDate());
  }
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - day.getTime()) / DAY_MS);
  return years >= 1 ? { years, days } : undefined;
};

// On the world's own calendar: read back from the date the entry was
// logged with ("Year 312, Harvest, day 4"), since time skips make the
// real timestamp no guide to the story date.
const storySince = (st: StoryTime, storyDate: string | undefined, now: number): Since | undefined => {
  const m = storyDate?.match(/(-?\d+), (.+), day (\d+)$/);
  if (!m) return undefined;
  const months = st.months.length ? st.months : DEFAULT_MONTHS;
  const monthIndex = months.indexOf(m[2]);
  if (monthIndex < 0) return undefined;
  const perMonth = Math.max(1, st.daysPerMonth);
  const perYear = perMonth * months.length;
  const today = storyParts(st, now);
  let years = today.year - Number(m[1]);
  let days = today.monthIndex * perMonth + (today.day - 1) - (monthIndex * perMonth + (Number(m[3]) - 1));
  if (days < 0) {
    days += perYear;
    years -= 1;
  }
  return years >= 1 ? { years, days } : undefined;
};

const ago = (s: Since) => `${s.years === 1 ? "A year" : `${s.years} years`} ago ${s.days === 0 ? "today" : "this week"}`;

// The moments whose anniversary it is, newest first, with `knower` only
// those they could know (#203).
export const anniversariesOf = (entries: TimelineEntry[], world: Pick<World, "storyTime"> | undefined, now: number, knows: (e: TimelineEntry) => boolean = () => true): { entry: TimelineEntry; since: Since }[] =>
  entries
    .filter((e) => isMoment(e) && knows(e))
    .map((entry) => ({ entry, since: world?.storyTime ? storySince(world.storyTime, entry.storyDate, now) : realSince(entry.at, now) }))
    .filter((x): x is { entry: TimelineEntry; since: Since } => Boolean(x.since && x.since.days <= GRACE_DAYS))
    .reverse()
    .slice(0, MAX);

export const anniversaryLine = (found: { entry: TimelineEntry; since: Since }[]): string | undefined =>
  found.length
    ? `Remembered this time of year: ${found.map((x) => `${ago(x.since)}, ${x.entry.text.replace(/[.\s]+$/, "")}`).join("; ")}. Bring it up only if it fits, as a memory.`
    : undefined;

// For one person's own notes: what they could know.
export const anniversaryNoteFor = (id: number | undefined, entries: TimelineEntry[], world: Pick<World, "storyTime"> | undefined, now: number) =>
  id === undefined ? undefined : anniversaryLine(anniversariesOf(entries, world, now, (e) => knowsEntry(e, id)));

// For a background prompt about several people: what's public, or known
// to every one of them, so nobody hears of a private moment through it.
export const anniversaryNoteAmong = (ids: number[], entries: TimelineEntry[], world: Pick<World, "storyTime"> | undefined, now: number) =>
  anniversaryLine(anniversariesOf(entries, world, now, (e) => (ids.length ? ids.every((id) => knowsEntry(e, id)) : audienceOf(e) === "public")));
