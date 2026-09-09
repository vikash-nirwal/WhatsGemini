import { Character, Message, UserProfile } from "../../../types";
import { YOU } from "../../../utils/constants";
import { stripLeakedBase64 } from "./apiUtils";
import { ChatMessage } from "../types";

// Converts stored DB messages into the provider-agnostic ChatMessage shape,
// stripping any leaked base64 image data and falling back to a single space
// since every provider's API requires non-empty message text.
export const buildChatHistory = (messages: Message[]): ChatMessage[] =>
  messages.map((msg) => {
    const text = stripLeakedBase64(msg.txt || "");
    return {
      role: msg.role === YOU ? "user" : "assistant",
      text: text.trim() || " ",
    };
  });

export interface SystemInstructionResult {
  text?: string;
  images?: string[];
  characterName?: string;
}

// Assembles the character's system instruction from clearly separated sections
// (persona, user profile, relationship, appearance, long-term memory, and any
// one-off directive like an auto-follow-up nudge) instead of one hand-built
// string. Whitespace is normalized once, here, rather than a second time by
// the caller.
export const buildSystemInstruction = (
  character: Character | undefined,
  extraDirectives?: string[],
  replyLengthLimit?: number,
  activePersona?: UserProfile
): SystemInstructionResult => {
  if (!character) return { text: undefined, images: undefined, characterName: undefined };

  const sections: string[] = [
    `Role play as, Character Name: ${character.name}.\nCharacter description: ${character.description}.\nPersonality & instructions: ${character.prompt}`,
  ];

  if (character.scenario) {
    sections.push(`Current scenario / setting: ${character.scenario}`);
  }

  if (activePersona) {
    const parts: string[] = [];
    if (activePersona.name) parts.push(`User's Name: ${activePersona.name}.`);
    if (activePersona.bio) parts.push(`User's Bio/Details: ${activePersona.bio}.`);
    if (activePersona.appearance) parts.push(`User's Appearance: ${activePersona.appearance}.`);
    if (activePersona.backstory) parts.push(`User's Backstory: ${activePersona.backstory}.`);
    if (parts.length > 0) {
      sections.push(`About the User you are talking to:\n${parts.join(" ")}`);
    }
  }

  if (character.relationship) {
    sections.push(`Your relationship with the user: ${character.relationship}`);
  }
  if (character.appearance) {
    sections.push(`Your physical appearance/looks: ${character.appearance}`);
  }
  if (character.memory && character.memory.length > 0) {
    sections.push(`Known facts about the user and your relationship, remembered from past conversations:\n- ${character.memory.join("\n- ")}`);
  }
  if (character.mes_example) {
    sections.push(
      `Example dialogue showing ${character.name}'s speech style, tone, and formatting (e.g. use of asterisks for actions) - use this only as a style reference, never repeat these lines verbatim:\n${character.mes_example}`
    );
  }
  if (extraDirectives && extraDirectives.length > 0) {
    sections.push(...extraDirectives);
  }
  if (replyLengthLimit && replyLengthLimit > 0) {
    sections.push(
      `Reply length: keep your messages to roughly ${replyLengthLimit} characters or less. Pace your reply so it naturally wraps up within that budget - never stop abruptly mid-sentence or mid-word. If a thought needs more room, wrap it up a little early or continue it in a natural follow-up message instead of overrunning the limit.`
    );
  }

  const text = sections
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, images: character.appearanceImages, characterName: character.name };
};

export interface TurnContext {
  history: ChatMessage[];
  systemInstruction?: string;
  characterImages?: string[];
  characterName?: string;
}

// The single function replacing the copy-pasted "build history + build system
// instruction" block that used to appear separately in handleSend,
// handleEditMessage, and handleRegenerate.
export const buildTurnContext = (
  messages: Message[],
  character: Character | undefined,
  extraDirectives?: string[],
  replyLengthLimit?: number,
  activePersona?: UserProfile
): TurnContext => {
  const history = buildChatHistory(messages);
  const { text, images, characterName } = buildSystemInstruction(character, extraDirectives, replyLengthLimit, activePersona);
  return { history, systemInstruction: text, characterImages: images, characterName };
};
