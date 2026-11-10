import { Chat, ChatReminder } from "../../types";

// Reminders and timers (#268): "remind me in 20 minutes" becomes a reminder
// kept on the chat, and the character texts when it's due. There's no
// server, so it fires while the app is open, or as soon as it's next opened.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const MIN_WAIT_MS = 5 * SECOND;
export const MAX_WAIT_MS = 30 * DAY;
export const MAX_REMINDERS = 20;

const UNIT_MS: Record<string, number> = { s: SECOND, m: MINUTE, h: HOUR, d: DAY };
const DURATION_PART = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)(?![a-z])/gi;
const CLOCK = /^(tomorrow\s+)?(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i;

// When a reminder is due: a wait ("20m", "1h30m", "in 2 hours") or a clock
// time on this device ("18:30", "6pm", "tomorrow 9:00"), which means the
// next time the clock shows it. Undefined when it can't be read.
export const parseWhen = (input: string, now: number): number | undefined => {
  const text = input.trim().toLowerCase().replace(/^in\s+/, "").replace(/\band\b|,/g, " ");
  if (!text) return undefined;
  let total = 0;
  const rest = text.replace(DURATION_PART, (_, amount: string, unit: string) => {
    total += Number(amount) * UNIT_MS[unit[0]];
    return "";
  });
  if (total > 0 && !rest.trim()) {
    return total >= MIN_WAIT_MS && total <= MAX_WAIT_MS ? now + Math.round(total) : undefined;
  }
  const clock = text.match(CLOCK);
  if (!clock) return undefined;
  let hour = Number(clock[2]);
  const minute = clock[3] ? Number(clock[3]) : 0;
  const half = clock[4];
  if (half && (hour < 1 || hour > 12)) return undefined;
  if (half === "pm" && hour < 12) hour += 12;
  if (half === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;
  const due = new Date(now);
  due.setHours(hour, minute, 0, 0);
  if (clock[1] || due.getTime() <= now) due.setDate(due.getDate() + 1);
  return due.getTime();
};

// "in 20 minutes", "at 18:30", "tomorrow at 09:00", for the result and the chip.
export const describeWhen = (at: number, now: number): string => {
  const wait = at - now;
  if (wait < MINUTE) return `in ${Math.max(1, Math.round(wait / SECOND))} seconds`;
  if (wait < 2 * HOUR) {
    const minutes = Math.round(wait / MINUTE);
    return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const due = new Date(at);
  const clock = `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`;
  const today = new Date(now);
  if (due.toDateString() === today.toDateString()) return `at ${clock}`;
  const tomorrow = new Date(now + DAY);
  if (due.toDateString() === tomorrow.toDateString()) return `tomorrow at ${clock}`;
  return `on ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${clock}`;
};

export const newReminder = (at: number, about: string, now: number, by?: number): ChatReminder => ({
  id: `rem-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  at,
  about: about.trim().slice(0, 200),
  setAt: now,
  ...(by !== undefined ? { by } : {}),
});

export const addReminder = (reminders: ChatReminder[] | undefined, reminder: ChatReminder): ChatReminder[] =>
  [...(reminders || []), reminder].sort((a, b) => a.at - b.at).slice(0, MAX_REMINDERS);

export const dueReminders = (reminders: ChatReminder[] | undefined, now: number): ChatReminder[] => (reminders || []).filter((r) => r.at <= now);

// How late counts as late: the app was closed when it came due.
const LATE_MS = 5 * MINUTE;

export const buildReminderPrompt = (charName: string, userName: string, reminder: ChatReminder, now: number, transcript: string): string => {
  const late = now - reminder.at > LATE_MS;
  const lateBy = Math.round((now - reminder.at) / MINUTE);
  return [
    `You are ${charName}, texting ${userName}. Earlier ${userName} asked you to remind them about: "${reminder.about}".`,
    late
      ? `It was due about ${lateBy >= 120 ? `${Math.round(lateBy / 60)} hours` : `${lateBy} minutes`} ago, and you couldn't reach them until now. Remind them now and say it's late.`
      : "It's time now. Remind them.",
    transcript ? `The last of your conversation, for tone:\n${transcript}` : "",
    `Write only the text message ${charName} sends: one or two short lines, in ${charName}'s voice, that plainly say what the reminder is for. No quotes, no tags, no narration.`,
  ].filter(Boolean).join("\n\n");
};

// The plain line used when the model can't be reached: a reminder that
// never arrives is worse than one out of character.
export const fallbackReminderText = (reminder: ChatReminder): string => `Reminder: ${reminder.about}`;

export const cleanReminderText = (reply: string): string =>
  reply
    .replace(/\[[^\]\n]*\]/g, "")
    .trim()
    .replace(/^["“]+|["”]+$/g, "")
    .trim()
    .slice(0, 600);

// The first reminder that's due, across every chat.
export const nextDueReminder = (chats: Chat[], now: number): { chat: Chat; reminder: ChatReminder } | undefined => {
  for (const chat of chats) {
    const reminder = dueReminders(chat.reminders, now)[0];
    if (chat.id && reminder) return { chat, reminder };
  }
  return undefined;
};
