import { ImportantDate } from "../../types";

// Dates that matter (#47): birthdays, anniversaries and "the day we met",
// set by hand or found in the character's memory. The character always
// knows them, is told when one is today or close, and - when the date asks
// for it - reaches out first on the day, once a year.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_DAYS = 3;

export const newDateId = () => `date-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const isValidDate = (d: Pick<ImportantDate, "month" | "day">) =>
  Number.isInteger(d.month) && d.month >= 1 && d.month <= 12 && Number.isInteger(d.day) && d.day >= 1 && d.day <= new Date(2024, d.month, 0).getDate();

export const formatDate = (d: ImportantDate) => `${MONTHS[d.month - 1]} ${d.day}${d.year ? `, ${d.year}` : ""}`;

// Days from `now` (local time) until the date's next occurrence; 0 = today.
// Feb 29 falls on Feb 28 in other years.
export const daysUntil = (d: ImportantDate, now: number): number => {
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const occurrence = (year: number) => {
    const day = d.month === 2 && d.day === 29 && new Date(year, 1, 29).getMonth() !== 1 ? 28 : d.day;
    return new Date(year, d.month - 1, day).getTime();
  };
  let next = occurrence(today.getFullYear());
  if (next < start) next = occurrence(today.getFullYear() + 1);
  return Math.round((next - start) / DAY_MS);
};

const yearsSince = (d: ImportantDate, now: number) => (d.year ? new Date(now).getFullYear() - d.year : undefined);

// The system-prompt section: every date, with today's and the near ones
// called out so the character brings them up at the right time.
export const buildDatesSection = (dates: ImportantDate[], now: number): string | undefined => {
  const valid = dates.filter(isValidDate);
  if (valid.length === 0) return undefined;
  const lines = valid.map((d) => {
    const until = daysUntil(d, now);
    const years = yearsSince(d, now);
    const note = until === 0 ? ` - that's TODAY${years && years > 0 ? ` (${years} years)` : ""}` : until <= SOON_DAYS ? ` - in ${until} day${until === 1 ? "" : "s"}` : "";
    return `- ${d.label}: ${formatDate(d)}${note}`;
  });
  const today = valid.filter((d) => daysUntil(d, now) === 0);
  return [
    "Dates that matter to you and the user (remember them like a real friend would):",
    ...lines,
    today.length > 0
      ? `Today is ${today.map((d) => d.label.toLowerCase()).join(" and ")}. Acknowledge it warmly and naturally in character, once, without overdoing it.`
      : "Mention a date only when it's today or coming up, or when it fits the conversation.",
  ].join("\n");
};

// Dates today that should get a message from the character, not yet sent
// this year.
export const datesToCelebrate = (dates: ImportantDate[], now: number): ImportantDate[] => {
  const year = new Date(now).getFullYear();
  return dates.filter((d) => isValidDate(d) && d.messageOnDay && d.lastCelebratedYear !== year && daysUntil(d, now) === 0);
};

export const buildCelebrationDirective = (dates: ImportantDate[]): string =>
  `Today is ${dates.map((d) => d.label.toLowerCase()).join(" and ")}. Reach out first about it, in character, the way you naturally would: warm, personal and specific to the two of you. Don't mention being reminded.`;

// "Find dates in memory": the AI reads the remembered facts and lists any
// dates in them.
export const buildDatesFromMemoryPrompt = (facts: string[]): string =>
  `From these remembered facts about a user and their roleplay companion, list every date that matters: birthdays, anniversaries, the day they met, other personal dates. Only dates with a month and day stated in the facts; don't guess.

Reply with only a JSON array, no code fence: [{"label": "short name, e.g. \\"Your birthday\\" or \\"The day we met\\"", "month": 1-12, "day": 1-31, "year": optional number}]. Reply [] if there are none.

Facts:
- ${facts.join("\n- ")}`;

export const parseDatesReply = (reply: string): ImportantDate[] => {
  const raw = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const data = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(data)) return [];
    return data
      .map((d: any): ImportantDate => ({
        id: newDateId(),
        label: typeof d?.label === "string" ? d.label.trim() : "",
        month: Number(d?.month),
        day: Number(d?.day),
        year: Number.isInteger(Number(d?.year)) && Number(d.year) > 1900 ? Number(d.year) : undefined,
        messageOnDay: true,
      }))
      .filter((d) => d.label && isValidDate(d));
  } catch {
    return [];
  }
};

// Merges found dates into the existing list, skipping ones already there.
export const mergeDates = (existing: ImportantDate[], found: ImportantDate[]): ImportantDate[] => {
  const key = (d: ImportantDate) => `${d.month}-${d.day}-${d.label.toLowerCase()}`;
  const seen = new Set(existing.map(key));
  return [...existing, ...found.filter((d) => !seen.has(key(d)))];
};
