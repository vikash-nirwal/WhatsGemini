import { Character, Chat, Message } from "../../types";
import { AI } from "../../utils/constants";
import { currentBlock } from "./schedule";
import { LETTER_AWAY_MS } from "./letters";

// They text first (#93): with the switch on, a character whose 1:1 chat has
// been quiet for a few hours sends a short casual text into it - something
// they saw, a thought about you, a plan coming up - while the app is open.
// Never while they're asleep (or at night, without a routine), never two
// unanswered in a row, at most two a day and six hours apart. After a few
// days a letter (#61) takes over, if they write letters.

export const FIRST_TEXT_QUIET_MS = 4 * 60 * 60 * 1000;
export const FIRST_TEXT_GAP_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_DAY = 2;
const KEEP = 10;

const lastReal = (content: Message[] | undefined): Message | undefined => {
  const real = (content || []).filter((m) => !m.isSystem && !m.isCompressionSummary);
  return real[real.length - 1];
};

// Awake: not asleep in their routine (#7); without one, 8 am to 10 pm.
export const awakeAt = (character: Pick<Character, "schedule">, now: number): boolean => {
  const block = currentBlock(character.schedule, now);
  if (character.schedule?.blocks?.length) return block?.status !== "asleep";
  const hour = new Date(now).getHours();
  return hour >= 8 && hour < 22;
};

export const firstTextDue = (character: Pick<Character, "textsFirst" | "firstTexts" | "schedule" | "writesLetters">, chat: Pick<Chat, "content" | "timestamp"> | undefined, now: number): boolean => {
  if (!character.textsFirst || !chat?.content?.length) return false;
  const last = lastReal(chat.content);
  if (!last) return false;
  // Never two unanswered in a row.
  if (last.role === AI && last.notes?.includes("texted-first")) return false;
  const quiet = now - (last.timestamp || chat.timestamp || now);
  if (quiet < FIRST_TEXT_QUIET_MS) return false;
  if (character.writesLetters && quiet >= LETTER_AWAY_MS) return false;
  const sent = character.firstTexts || [];
  if (sent.filter((t) => now - t < DAY_MS).length >= MAX_PER_DAY) return false;
  if (sent.some((t) => now - t < FIRST_TEXT_GAP_MS)) return false;
  return awakeAt(character, now);
};

export const addFirstText = (sent: number[] | undefined, at: number): number[] => [...(sent || []), at].slice(-KEEP);

export interface FirstTextContext {
  hoursQuiet: number;
  nowDoing?: string;
  plans: string[];
  facts: string[];
  transcript: string;
  dayMood?: string; // bad days (#95)
  dayLog?: string; // one consistent day (#107): what today has been like
  concerns?: string; // their own preoccupations (#110), one line
  style?: string; // how they write (#111), one line
  dream?: string; // dreams (#94): the dream directive, when it's the morning for one
}

export const buildFirstTextPrompt = (
  character: Pick<Character, "name" | "description" | "prompt" | "relationship">,
  userName: string,
  ctx: FirstTextContext
): string => `You are ${character.name}, texting ${userName}. You last talked ${ctx.hoursQuiet} hours ago, and now you're messaging first, unprompted.

About you: ${[character.description, character.prompt].filter(Boolean).join(" ").slice(0, 700)}
${character.relationship ? `You and ${userName}: ${character.relationship}\n` : ""}${ctx.nowDoing ? `Right now you're ${ctx.nowDoing}.\n` : ""}${ctx.dayMood ? `Today you're ${ctx.dayMood}.\n` : ""}${ctx.dayLog ? `Your day so far (keep to it): ${ctx.dayLog}\n` : ""}${ctx.concerns ? `On your mind lately: ${ctx.concerns}\n` : ""}${ctx.plans.length > 0 ? `Plans you two have made:\n- ${ctx.plans.join("\n- ")}\n` : ""}${ctx.facts.length > 0 ? `What you remember:\n- ${ctx.facts.slice(-8).join("\n- ")}\n` : ""}
How you last left things:
${ctx.transcript}

${ctx.dream ? `${ctx.dream}\nWrite it as a text message or two.` : `Write a short, casual text: something you just saw or did that made you think of ${userName}, a thought, a question, or a plan coming up. Not a greeting card, not "just checking in".`}
- ${ctx.style ? `The way you write: ${ctx.style}.` : "One to three short sentences, the way you'd really text: lowercase is fine, one emoji at most."}
- Stay in character and in the story's world. No mention of being an AI. Reply with only the text.`;

export const cleanFirstText = (reply: string): string | undefined => {
  const text = reply.trim().replace(/^```[a-z]*\s*|```\s*$/gi, "").replace(/^["“]|["”]$/g, "").trim();
  if (text.length < 2) return undefined;
  return text.length > 600 ? `${text.slice(0, 597).trimEnd()}...` : text;
};
