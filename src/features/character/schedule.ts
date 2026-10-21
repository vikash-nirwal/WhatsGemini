import { CharacterSchedule, ScheduleBlock } from "../../types";

// Character schedule and presence (#7): a simple daily routine, in hour
// blocks, each with what the character is doing and whether they're free,
// busy or asleep. It drives the "online / last seen" line in the chat
// header, tells the character what they're up to right now, and (when the
// schedule asks for it) delays replies a little while they're busy.

export const TYPICAL_DAY: ScheduleBlock[] = [
  { start: 0, end: 7, activity: "asleep", status: "asleep" },
  { start: 7, end: 9, activity: "getting ready for the day", status: "free" },
  { start: 9, end: 17, activity: "at work", status: "busy" },
  { start: 17, end: 23, activity: "relaxing at home", status: "free" },
  { start: 23, end: 24, activity: "asleep", status: "asleep" },
];

const hourOf = (now: number) => {
  const d = new Date(now);
  return d.getHours() + d.getMinutes() / 60;
};

// The block covering `now`; blocks may wrap past midnight (start > end).
export const currentBlock = (schedule: CharacterSchedule | undefined, now: number): ScheduleBlock | undefined => {
  if (!schedule?.blocks?.length) return undefined;
  const h = hourOf(now);
  return schedule.blocks.find((b) => (b.start <= b.end ? h >= b.start && h < b.end : h >= b.start || h < b.end));
};

export interface Presence {
  online: boolean;
  label: string; // for the chat header
}

const ago = (ms: number): string => {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export const presenceFor = (schedule: CharacterSchedule | undefined, now: number, lastSeen?: number): Presence | undefined => {
  const block = currentBlock(schedule, now);
  if (!block) return undefined;
  if (block.status === "free") return { online: true, label: "online" };
  const seen = lastSeen ? ` · last seen ${ago(now - lastSeen)}` : "";
  return { online: false, label: `${block.activity}${seen}` };
};

const fmtHour = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

// For the system prompt: the routine, and what they're doing right now.
export const buildScheduleSection = (schedule: CharacterSchedule | undefined, now: number): string | undefined => {
  const block = currentBlock(schedule, now);
  if (!schedule?.blocks?.length || !block) return undefined;
  const routine = schedule.blocks.map((b) => `${fmtHour(b.start)}-${fmtHour(b.end)} ${b.activity}`).join("; ");
  const state = block.status === "asleep"
    ? "You're asleep right now: if the user messages, you've just been woken up, or reply sleepily and briefly."
    : block.status === "busy"
      ? "You're busy right now, so replies are short and you may mention what you're in the middle of."
      : "You're free right now.";
  return `Your daily routine: ${routine}. Right now you're ${block.activity}. ${state} Mention your day naturally when it fits (for example "just got off my shift").`;
};

// "Realistic" schedules: how long a reply waits while they're busy or
// asleep, as if they'd only just seen the message. Free: no wait.
export const replyDelayMs = (schedule: CharacterSchedule | undefined, now: number, random: () => number = Math.random): number => {
  if (!schedule?.realistic) return 0;
  const block = currentBlock(schedule, now);
  if (!block || block.status === "free") return 0;
  const [min, max] = block.status === "asleep" ? [45_000, 120_000] : [15_000, 45_000];
  return Math.round(min + random() * (max - min));
};

// Blocks with nothing to say are dropped; hours are kept in 0-24.
export const cleanSchedule = (schedule: CharacterSchedule | undefined): CharacterSchedule | undefined => {
  const blocks = (schedule?.blocks || [])
    .map((b) => ({ ...b, activity: b.activity.trim(), start: Math.max(0, Math.min(24, b.start)), end: Math.max(0, Math.min(24, b.end)) }))
    .filter((b) => b.activity && b.start !== b.end);
  return blocks.length > 0 ? { blocks, realistic: schedule?.realistic || undefined } : undefined;
};
