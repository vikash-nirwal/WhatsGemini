import { World, WorldEvent } from "../../types";
import { storyParts } from "./storyTime";

// A year with a rhythm (#222). Worlds had no seasons and nothing came back
// year after year, so they felt like they had no history. Now every
// world's time-and-place line names the season - from its own calendar, or
// the real one - and an event people would hold again (asked in its
// aftermath, #219) becomes a tradition that returns on its date, with no
// model call.

export type Tradition = NonNullable<World["traditions"]>[number];

const DAY = 24 * 60 * 60 * 1000;
const SEASONS = ["winter", "spring", "summer", "autumn"];

// Where in the year it is: the world's own calendar when it has one,
// otherwise the real date (northern seasons).
export const yearPosition = (world: Pick<World, "storyTime"> | undefined, now: number): { year: number; month: number; day: number; months: number } => {
  const st = world?.storyTime;
  if (st) {
    const p = storyParts(st, now);
    return { year: p.year, month: p.monthIndex, day: p.day, months: Math.max(1, st.months.length || 12) };
  }
  const d = new Date(now);
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), months: 12 };
};

// "early spring", "late autumn": the year in four seasons, winter starting
// in the year's last twelfth (December, on the real calendar).
export const seasonOf = (world: Pick<World, "storyTime"> | undefined, now: number): string => {
  const { month, day, months } = yearPosition(world, now);
  const perMonth = world?.storyTime ? Math.max(1, world.storyTime.daysPerMonth) : 31;
  // A twelfth of the year back, so winter takes in the year's last stretch
  // whatever the number of months.
  const through = ((month + (day - 1) / perMonth) / months + 1 / 12) % 1;
  const quarter = Math.floor(through * 4);
  const within = (through * 4) % 1;
  return `${within < 1 / 3 ? "early " : within > 2 / 3 ? "late " : ""}${SEASONS[quarter]}`;
};

// The tradition an event becomes: the same date every year in the world's
// calendar, for as long as it ran.
export const traditionFrom = (world: Pick<World, "storyTime">, event: WorldEvent): Tradition => {
  const { month, day, year } = yearPosition(world, event.at);
  return { id: `tr-${event.id}`, title: event.title, text: event.text, month, day, days: Math.max(1, Math.round((event.endsAt - event.at) / DAY)), lastYear: year };
};

// A tradition whose day has come this year (or came in the last few days),
// not yet held this year.
export const traditionDue = (world: Pick<World, "storyTime" | "traditions">, now: number): Tradition | undefined => {
  const at = yearPosition(world, now);
  const perMonth = world.storyTime ? Math.max(1, world.storyTime.daysPerMonth) : 31;
  const dayOfYear = (month: number, day: number) => month * perMonth + day;
  return (world.traditions || []).find((t) => {
    if (t.lastYear !== undefined && t.lastYear >= at.year) return false;
    const since = dayOfYear(at.month, at.day) - dayOfYear(t.month, t.day);
    return since >= 0 && since <= 3;
  });
};

export const heldAgain = (t: Tradition, id: string, now: number): WorldEvent => ({ id, title: t.title, text: `${t.text} As every year.`, at: now, endsAt: now + t.days * DAY });
