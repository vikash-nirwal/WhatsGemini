import { StoryTime } from "../../types";

// Story time (#147): a world can keep its own calendar ("Year 312, Harvest
// month, day 4"), moving with real time or only by time skips. Prompts and
// "While you were away" use it instead of your clock.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const newStoryTime = (now: number): StoryTime => ({ yearLabel: "Year", year: 1, months: DEFAULT_MONTHS, daysPerMonth: 30, day: 0, anchorAt: now, moves: true, start: { year: 1, day: 0 } });

// Days since the calendar's start, today.
export const storyDayAt = (st: StoryTime, now: number) => st.day + (st.moves ? Math.max(0, Math.floor((now - st.anchorAt) / DAY_MS)) : 0);

export const storyParts = (st: StoryTime, now: number) => {
  const months = st.months.length ? st.months : DEFAULT_MONTHS;
  const perMonth = Math.max(1, st.daysPerMonth);
  const perYear = perMonth * months.length;
  const total = storyDayAt(st, now);
  return {
    year: st.year + Math.floor(total / perYear),
    month: months[Math.floor((total % perYear) / perMonth)],
    monthIndex: Math.floor((total % perYear) / perMonth),
    day: (total % perMonth) + 1,
  };
};

const partOfDay = (now: number) => {
  const h = new Date(now).getHours();
  return h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
};

// "Year 312, Harvest month, day 4", with the part of the day while it moves
// with real time (a paused calendar has no clock).
export const formatStoryDate = (st: StoryTime, now: number, withTime = false) => {
  const { year, month, day } = storyParts(st, now);
  const date = `${st.yearLabel?.trim() ? `${st.yearLabel.trim()} ` : ""}${year}, ${month}, day ${day}`;
  return withTime && st.moves ? `${date}, ${partOfDay(now)}` : date;
};

// A time skip: the calendar jumps ahead and counts on from now.
export const skipStoryTime = (st: StoryTime, days: number, now: number): StoryTime => ({ ...st, day: storyDayAt(st, now) + days, anchorAt: now });

// Setting today's date by hand (month index and day of month, this year).
export const setStoryDate = (st: StoryTime, { year, monthIndex, day }: { year: number; monthIndex: number; day: number }, now: number): StoryTime => {
  const months = st.months.length ? st.months : DEFAULT_MONTHS;
  const perMonth = Math.max(1, st.daysPerMonth);
  const m = Math.min(Math.max(0, monthIndex), months.length - 1);
  const d = Math.min(Math.max(1, day), perMonth);
  // A date set by hand is where the story starts, for Reset (#158); skips aren't.
  return { ...st, year, day: m * perMonth + (d - 1), anchorAt: now, start: { year, day: m * perMonth + (d - 1) } };
};

export const storyDaysBetween = (st: StoryTime, from: number, to: number) => storyDayAt(st, to) - storyDayAt(st, from);

// In place of the real-world clock in a reply's prompt.
export const buildStoryTimeSection = (st: StoryTime, worldName: string, now: number, gapMs?: number): string => {
  const lines = [`In-world date in ${worldName}: ${formatStoryDate(st, now, true)}.`];
  if (st.moves && gapMs != null && gapMs >= DAY_MS) {
    const days = Math.round(gapMs / DAY_MS);
    lines.push(`About ${days} ${days === 1 ? "day" : "days"} passed in the story since the previous message.`);
  }
  lines.push("This world keeps its own calendar: use it for dates, seasons and holidays, never the real one.");
  return lines.join(" ");
};

export const parseMonths = (text: string): string[] => text.split(",").map((m) => m.trim()).filter(Boolean);
