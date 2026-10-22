import { Message } from "../../types";

// "On this day" (#83): a month, 100 days or a year (and every year after)
// from your first chat or the end of a chapter, the character remembers it
// unprompted. Worked out from the messages' timestamps alone, so there's
// nothing to store: the note goes in until the character's first reply of
// that day, which is when they bring it up.

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface OnThisDayMoment {
  what: string; // "your first chat", "the end of the chapter "The Storm""
  at: number;
  milestone: string; // "one year", "100 days", "one month"
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

// Same day of the month, `months` later; a day the month doesn't have falls
// on its last day (Jan 31 -> Feb 28).
const addMonths = (t: number, months: number) => {
  const d = new Date(t);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + months + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + months, Math.min(d.getDate(), lastDay)).getTime();
};

const YEAR_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

// Which milestone, if any, today is for something that happened at `at`.
export const milestoneOn = (at: number, now: number): string | undefined => {
  const today = startOfDay(now);
  const day = startOfDay(at);
  if (today <= day) return undefined;
  if (addMonths(day, 1) === today) return "one month";
  if (Math.round((today - day) / DAY_MS) === 100) return "100 days";
  const years = new Date(today).getFullYear() - new Date(day).getFullYear();
  if (years >= 1 && addMonths(day, years * 12) === today) return `${YEAR_WORDS[years - 1] || years} year${years === 1 ? "" : "s"}`;
  return undefined;
};

export const momentsOnThisDay = (messages: Message[], now: number): OnThisDayMoment[] => {
  const candidates: Omit<OnThisDayMoment, "milestone">[] = [];
  const first = messages.find((m) => m.timestamp);
  if (first?.timestamp) candidates.push({ what: "your first chat", at: first.timestamp });
  for (const m of messages) {
    if (m.chapterTitle && m.timestamp) candidates.push({ what: `the end of the chapter "${m.chapterTitle}"`, at: m.timestamp });
  }
  return candidates
    .map((c) => ({ ...c, milestone: milestoneOn(c.at, now) }))
    .filter((c): c is OnThisDayMoment => Boolean(c.milestone));
};

const formatDay = (t: number) => {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

// The prompt note for today's moments, until the character's first reply of
// the day (after that they've had their chance to bring it up).
export const buildOnThisDayNote = (messages: Message[], userName: string, now: number): string | undefined => {
  const today = startOfDay(now);
  if (messages.some((m) => m.role !== "you" && !m.isSystem && !m.isCompressionSummary && (m.timestamp || 0) >= today)) return undefined;
  const moments = momentsOnThisDay(messages, now);
  if (moments.length === 0) return undefined;
  const lines = moments.map((m) => `- It's ${m.milestone} today since ${m.what} with ${userName} (${formatDay(m.at)}).`);
  return [
    "On this day:",
    ...lines,
    `You remember it on your own, the way someone who cares would. Bring it up once, naturally and in character, without saying you were reminded.`,
  ].join("\n");
};
