import { Character, Chat } from "../../types";
import { currentBlock } from "../character/schedule";
import { dayMoodFor } from "../character/badDays";
import { fadedMood } from "./lingeringMood";

// Left on read (#126): a character with the switch on sometimes reads your
// message and answers minutes later, more often when they're busy, having
// an off day, upset, or in a fight with you. While they haven't answered,
// your messages show as read and get no reply; when the time comes the
// reply arrives with a note that it's late, so they may say why.

export const LEFT_ON_READ_LEVELS = { 1: "Sometimes", 2: "Often", 3: "Always" } as const;
const BASE: Record<1 | 2 | 3, number> = { 1: 0.12, 2: 0.35, 3: 1 };
const NEGATIVE = new Set(["angry", "annoyed", "sad", "shaken", "embarrassed"]);
const MIN_MS = 3 * 60 * 1000;
const MAX_MS = 25 * 60 * 1000;

export const leftOnReadChance = (character: Pick<Character, "id" | "leavesOnRead" | "schedule" | "badDays" | "dayMood">, chat: Pick<Chat, "mood" | "conflict"> | undefined, now: number): number => {
  const level = character.leavesOnRead;
  if (!level) return 0;
  let chance = BASE[level];
  if (currentBlock(character.schedule, now)?.status === "busy") chance += 0.25;
  if (dayMoodFor(character, now)) chance += 0.15;
  const mood = fadedMood(chat?.mood, now);
  if (mood && NEGATIVE.has(mood.feeling)) chance += 0.15;
  if (chat?.conflict) chance += 0.2;
  return Math.min(1, chance);
};

// How long they leave it, or 0 for an answer now.
export const leftOnReadDelay = (character: Parameters<typeof leftOnReadChance>[0], chat: Parameters<typeof leftOnReadChance>[1], now: number, rand: () => number = Math.random): number =>
  rand() < leftOnReadChance(character, chat, now) ? Math.round(MIN_MS + rand() * (MAX_MS - MIN_MS)) : 0;

export const buildLateReplyDirective = (charName: string, userName: string, minutes: number): string =>
  `${charName} read ${userName}'s message${minutes >= 1 ? ` about ${Math.round(minutes)} minute${Math.round(minutes) === 1 ? "" : "s"} ago` : " a while ago"} and is only answering now. If it fits, say briefly why (busy, distracted, needed a moment, or still a bit upset), in character, without over-apologizing.`;
