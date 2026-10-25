import { lifeScaled } from "../life/lifeDial";
import { Character, CharacterLetter, Message } from "../../types";

// Letters (#61): when you've been away from a 1:1 chat for a few days, a
// character with letters on writes you a longer letter instead of a chat
// bubble, once per absence. Letters collect on the character, show in the
// chat where they arrived, can be answered, and the next replies know about
// the latest one.

export const LETTER_AWAY_MS = 3 * 24 * 60 * 60 * 1000;
const KEEP = 20;

const lastActivity = (content: Message[] | undefined, fallback = 0): number =>
  content && content.length > 0 ? content[content.length - 1].timestamp || fallback : fallback;

export const letterDue = (character: Pick<Character, "writesLetters" | "letters">, chat: { content?: Message[]; timestamp?: number } | undefined, now: number): boolean => {
  if (!character.writesLetters || !chat || !chat.content?.length) return false;
  const last = lastActivity(chat.content, chat.timestamp);
  if (now - last < lifeScaled(LETTER_AWAY_MS)) return false;
  return !(character.letters || []).some((l) => l.at > last);
};

export const buildLetterPrompt = (
  character: Pick<Character, "name" | "description" | "prompt" | "relationship">,
  userName: string,
  daysAway: number,
  facts: string[],
  transcript: string,
  nowDoing?: string,
  summary?: string
): string => `You are ${character.name}. ${userName} hasn't written in ${daysAway} days. Write them a letter, the way you'd write one by hand.

About you: ${[character.description, character.prompt].filter(Boolean).join(" ").slice(0, 700)}
${character.relationship ? `You and ${userName}: ${character.relationship}\n` : ""}${nowDoing ? `These days you're usually ${nowDoing}.\n` : ""}${facts.length > 0 ? `What you remember:\n- ${facts.slice(-10).join("\n- ")}\n` : ""}${summary ? `The story so far:\n${summary}\n` : ""}
How you last left things:
${transcript}

- 150 to 300 words, first person, in your own voice, starting with a greeting to ${userName} and ending with a sign-off and your name.
- What you've been up to, what you've been thinking about, what you'd like to say that's easier in writing, and how you feel about the silence.
- Stay in character and in the story's world. No mention of being an AI or a chat. Reply with only the letter.`;

export const cleanLetter = (reply: string): string | undefined => {
  const text = reply.trim().replace(/^```[a-z]*\s*|```\s*$/gi, "").replace(/^(letter|subject)\s*:\s*/i, "").trim();
  return text.length >= 40 ? text.slice(0, 4000) : undefined;
};

export const addLetter = (letters: CharacterLetter[] | undefined, letter: CharacterLetter): CharacterLetter[] => [...(letters || []), letter].slice(-KEEP);

export const letterReplyDraft = (letter: CharacterLetter): string => {
  const opening = letter.text.split("\n").find((l) => l.trim())?.trim() || "";
  return `(Replying to your letter: "${opening.length > 60 ? `${opening.slice(0, 57)}...` : opening}") `;
};

// The latest letter, while it's still fresh in the chat, for the next replies.
export const buildLetterSection = (letter: CharacterLetter | undefined, userName: string): string | undefined =>
  letter ? `While ${userName} was away, you wrote them this letter (they may have read it; it's part of your story):\n"""\n${letter.text.slice(0, 1500)}\n"""` : undefined;
