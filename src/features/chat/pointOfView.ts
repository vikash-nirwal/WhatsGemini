import { Message } from "../../types";
import { AI } from "../../utils/constants";

// Their point of view (#101): the recent scene told again as the
// character's own first-person account, with what they thought but didn't
// say (their inner thoughts, #10, where the chat has them). Shown in a
// dialog; you can copy it or keep it in their diary (#5).

export const POV_MESSAGES = 16;

// The thoughts they had during the scene, so the retelling can use them.
export const thoughtsIn = (messages: Message[]): string[] =>
  messages.filter((m) => m.role === AI && m.thoughts?.trim()).map((m) => m.thoughts!.trim()).slice(-6);

export const buildPovPrompt = (name: string, userName: string, about: string, transcript: string, thoughts: string[]): string =>
  `Retell this scene from ${name}'s side, as ${name}'s own first-person account.

About ${name}: ${about.slice(0, 600)}

The scene:
${transcript}
${thoughts.length > 0 ? `\nWhat ${name} was privately thinking at the time:\n- ${thoughts.join("\n- ")}\n` : ""}
- First person, past tense, in ${name}'s voice, like a passage from a novel told by them.
- Include what ${name} noticed, felt and thought but didn't say - especially about ${userName} - and how they read ${userName}'s words and actions (they may get some of it wrong).
- Follow what happened; don't add new events. 150 to 350 words.
- Reply with only the passage.`;

export const cleanPov = (reply: string): string | undefined => {
  const text = reply.trim().replace(/^```[a-z]*\s*|```\s*$/gi, "").trim();
  return text.length >= 40 ? text.slice(0, 5000) : undefined;
};
