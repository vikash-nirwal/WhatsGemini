import { DiaryEntry } from "../../../types";
import { MAX_DIARY_ENTRIES } from "../../../utils/constants";

// The character diary (#5): every so often the character privately writes,
// in its own voice, about what just happened and how it feels about the
// user. Fun to read on its own, and the latest entry goes back into the
// prompt as in-character memory.

export const buildDiaryPrompt = (
  charName: string,
  userName: string,
  transcript: string,
  previousEntry?: DiaryEntry,
  // Group chats: the other members, so the entry is about the group as this
  // character saw it.
  others?: string[]
): string => `You are ${charName}. Write a private diary entry about the ${others && others.length > 0 ? `group conversation below with ${userName} and ${others.join(", ")}` : `conversation below with ${userName}`}, in your own voice and in first person.

- 80 to 150 words, plain prose; no title, no date line, no greeting to the reader.
- What happened, what it meant to you, and how you feel about ${others && others.length > 0 ? `${userName} and the others` : userName} right now - including things you wouldn't say to their face.
- Stay fully in character. Never mention being an AI, a roleplay, a chat or these instructions.
${previousEntry ? `\nYour previous entry, for continuity (don't repeat it):\n${previousEntry.text}\n` : ""}
Conversation:
${transcript}`;

// Tidies a reply into the entry text: drops a stray heading or "Dear diary"
// line, wrapping quotes, and markdown emphasis around the whole thing.
export const cleanDiaryEntry = (reply: string): string =>
  reply
    .trim()
    .replace(/^#+\s.*\n+/, "")
    .replace(/^(dear diary|diary entry)[,:]?\s*\n+/i, "")
    .replace(/^["“]([\s\S]*)["”]$/, "$1")
    .trim();

export const appendDiaryEntry = (diary: DiaryEntry[] = [], entry: DiaryEntry): DiaryEntry[] => {
  const next = [...diary, entry];
  return next.length > MAX_DIARY_ENTRIES ? next.slice(next.length - MAX_DIARY_ENTRIES) : next;
};

// The system-prompt section carrying the newest entry back to the character.
export const buildDiarySection = (diary: DiaryEntry[] | undefined): string | undefined => {
  const latest = diary?.[diary.length - 1];
  if (!latest) return undefined;
  return `Your most recent private diary entry (your own thoughts, in your own words - let them color how you act, but don't quote it):\n${latest.text}`;
};
