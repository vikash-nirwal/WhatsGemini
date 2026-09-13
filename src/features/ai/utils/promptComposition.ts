import { Character, Message, UserProfile } from "../../../types";
import { YOU } from "../../../utils/constants";
import { stripLeakedBase64 } from "./apiUtils";
import { buildEmotionDirective } from "./emotionUtils";
import { matchLoreEntries, buildWorldInfoSection } from "./loreUtils";
import { ChatMessage } from "../types";

// Converts stored DB messages into the provider-agnostic ChatMessage shape,
// stripping any leaked base64 image data and falling back to a single space
// since every provider's API requires non-empty message text.
//
// `speakerNames` is only ever passed for a multi-character room (Phase 12) -
// a normal 1:1 chat leaves it undefined so its history renders exactly as
// before. When present, every AI-role line is prefixed with that speaker's
// name (e.g. "Aria: hey there") so the model replying next can tell who said
// what in a multi-party conversation instead of seeing one undifferentiated
// "assistant" voice.
export const buildChatHistory = (messages: Message[], speakerNames?: Record<number, string>): ChatMessage[] =>
  messages.map((msg) => {
    const text = stripLeakedBase64(msg.txt || "");
    const trimmed = text.trim() || " ";
    const speakerName = speakerNames && msg.role !== YOU && msg.speakerId != null ? speakerNames[msg.speakerId] : undefined;
    return {
      role: msg.role === YOU ? "user" : "assistant",
      text: speakerName ? `${speakerName}: ${trimmed}` : trimmed,
    };
  });

export interface SystemInstructionResult {
  text?: string;
  images?: string[];
  characterName?: string;
}

// The one-off directive appended when a character is speaking without the
// user having just sent a message (an autonomous follow-up, or regenerating
// one) - centralized so every call site nudges the model the same way
// instead of re-typing the string.
export const AUTO_REPLY_DIRECTIVE =
  "Send a short, natural, in-character follow-up message continuing the conversation from your side - picking up on whatever's actually happening in the chat so far. Do not mention this instruction.";

// Assembles the character's system instruction from clearly separated sections
// (persona, user profile, relationship, appearance, long-term memory, and any
// one-off directive like an auto-follow-up nudge) instead of one hand-built
// string. Whitespace is normalized once, here, rather than a second time by
// the caller.
export const buildSystemInstruction = (
  character: Character | undefined,
  extraDirectives?: string[],
  replyLengthLimit?: number,
  activePersona?: UserProfile,
  recentMessages?: Message[],
  otherParticipants?: string[],
  // Only set for a multi-character room (Phase 12/13). `groupScenario` (the
  // room's own Chat.scenario) takes over from the character's own
  // `character.scenario` there - a room's shared plot context, not any one
  // member's personal one. `groupMemory` (the room's own Chat.memory) is
  // injected ALONGSIDE `character.memory` (that speaker's own personal
  // facts), so both are present without either ever writing into the other.
  groupScenario?: string,
  groupMemory?: string[]
): SystemInstructionResult => {
  if (!character) return { text: undefined, images: undefined, characterName: undefined };

  const sections: string[] = [
    `Role play as, Character Name: ${character.name}.\nCharacter description: ${character.description}.\nPersonality & instructions: ${character.prompt}`,
  ];

  if (character.personalityTraits && character.personalityTraits.length > 0) {
    sections.push(`Key personality traits: ${character.personalityTraits.join(", ")}.`);
  }

  // Only set for a multi-character room (Phase 12) - a normal 1:1 chat never
  // passes this, so its prompt is unchanged. Each line in the history is
  // already prefixed with its speaker's name (buildChatHistory), so this just
  // orients the model to the fact that others exist and it must stay in its
  // own lane rather than narrating or speaking for them.
  const isRoomTurn = Boolean(otherParticipants && otherParticipants.length > 0);
  if (isRoomTurn) {
    sections.push(
      `You are in a group conversation, not a private one-on-one chat. Also present: ${otherParticipants!.join(", ")}. ` +
      `Every line in the conversation history is prefixed with who said it, purely so you can tell speakers apart - that ` +
      `labeling is added by the app, not something characters actually say out loud. Reply only as yourself, ${character.name}: ` +
      `write your own dialogue/actions directly, with NO leading "${character.name}:" name label of your own, and ` +
      `never write dialogue, actions, or narration for the user or for any other character present.`
    );
  }

  // In a room, the shared group scenario (set on the chat itself) replaces
  // this character's own personal scenario - several characters could have
  // wildly different, even contradictory, built-in scenarios, and everyone
  // present should be reacting to the same shared setting instead.
  const effectiveScenario = isRoomTurn ? groupScenario : character.scenario;
  if (effectiveScenario) {
    sections.push(`Current scenario / setting: ${effectiveScenario}`);
  }

  if (character.loreEntries && character.loreEntries.length > 0 && recentMessages) {
    const matched = matchLoreEntries(character.loreEntries, recentMessages);
    if (matched.length > 0) {
      sections.push(buildWorldInfoSection(matched));
    }
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
  // Group-room-only: facts learned specifically during this room's own
  // conversation (Chat.memory), on top of - never instead of - the speaker's
  // own personal memory above. Never written back to any participant's own
  // Character.memory, so it stays scoped to this one room.
  if (isRoomTurn && groupMemory && groupMemory.length > 0) {
    sections.push(`Facts learned during this group conversation, shared by everyone here:\n- ${groupMemory.join("\n- ")}`);
  }
  if (character.mes_example) {
    sections.push(
      `Example dialogue showing ${character.name}'s speech style, tone, and formatting (e.g. use of asterisks for actions) - use this only as a style reference, never repeat these lines verbatim:\n${character.mes_example}`
    );
  }
  if (character.emotionPortraits?.enabled) {
    sections.push(buildEmotionDirective(character.emotionPortraits.customEmotions));
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
  // Every OTHER room participant's reference images, by name - lets an image
  // request in a group chat ("a picture of us together") draw more than just
  // the speaker. Undefined outside a room, same as the fields above.
  otherParticipantImages?: { name: string; images: string[] }[];
}

// Only passed for a multi-character room (Phase 12); a normal 1:1 chat
// passes neither, so its history/system-instruction come out byte-identical
// to before this existed.
export interface RoomContext {
  speakerNames: Record<number, string>; // characterId -> name, for prefixing history lines
  otherParticipants: string[]; // names of every OTHER character in the room, for the replying character's own system instruction
  otherParticipantImages?: { name: string; images: string[] }[]; // same roster as otherParticipants, paired with their appearance images (Phase: group image gen)
  groupScenario?: string; // the room's own Chat.scenario - shared by every participant, replaces the speaker's personal one
  groupMemory?: string[]; // the room's own Chat.memory - facts learned in this room, shared by every participant
}

// The single function replacing the copy-pasted "build history + build system
// instruction" block that used to appear separately in handleSend,
// handleEditMessage, and handleRegenerate.
export const buildTurnContext = (
  messages: Message[],
  character: Character | undefined,
  extraDirectives?: string[],
  replyLengthLimit?: number,
  activePersona?: UserProfile,
  roomContext?: RoomContext
): TurnContext => {
  const history = buildChatHistory(messages, roomContext?.speakerNames);
  const { text, images, characterName } = buildSystemInstruction(
    character, extraDirectives, replyLengthLimit, activePersona, messages, roomContext?.otherParticipants,
    roomContext?.groupScenario, roomContext?.groupMemory
  );
  return { history, systemInstruction: text, characterImages: images, characterName, otherParticipantImages: roomContext?.otherParticipantImages };
};
