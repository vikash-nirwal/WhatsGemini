import { Character, LoreEntry, Message, RoleplayStyle, UserProfile } from "../../../types";
import { YOU } from "../../../utils/constants";
import { stripLeakedBase64 } from "./apiUtils";
import { buildEmotionDirective } from "./emotionUtils";
import { matchLoreEntries, buildWorldInfoSection } from "./loreUtils";
import { applyMacros } from "./macros";
import { ChatMessage } from "../types";

// Whose turn it is in a multi-character room, for buildChatHistory's
// per-speaker role mapping (see there).
export interface HistoryPerspective {
  selfId: number; // the character about to reply
  userName?: string; // the persona's name, used to label the human's own lines
}

// Converts stored DB messages into the provider-agnostic ChatMessage shape,
// stripping any leaked base64 image data and falling back to a single space
// since every provider's API requires non-empty message text.
//
// `speakerNames` is only ever passed for a multi-character room (Phase 12) -
// a normal 1:1 chat leaves it undefined so its history renders exactly as
// before. When present, every other-speaker line is prefixed with that
// speaker's name (e.g. "Aria: hey there") so the model can tell who said what.
//
// `perspective` (room turns) additionally maps roles from the replying
// character's point of view: only that character's own lines are
// "assistant"; every other character's lines, and the human's, arrive as
// labeled "user" turns. Sending every character's lines as "assistant" made
// the model read other characters' words as its own, so voices blurred and it
// drifted into speaking for them. Consecutive same-role turns are merged so
// the history still alternates, which some providers require.
export const buildChatHistory = (
  messages: Message[],
  speakerNames?: Record<number, string>,
  perspective?: HistoryPerspective
): ChatMessage[] => {
  // Flagged refusals stay on screen but never reach the model: resending one
  // primes every later reply to refuse too.
  const mapped = messages.filter((msg) => !msg.isRefusal).map((msg): ChatMessage => {
    const text = stripLeakedBase64(msg.txt || "");
    const trimmed = text.trim() || " ";

    if (perspective) {
      if (msg.role === YOU) {
        return { role: "user", text: perspective.userName && !msg.isCompressionSummary ? `${perspective.userName}: ${trimmed}` : trimmed };
      }
      // Own lines (and legacy lines with no speaker recorded, other than
      // room notices) stay "assistant" and unlabeled - labeling its own turns
      // is what teaches a model to start replies with "Name:".
      if (msg.speakerId === perspective.selfId || (msg.speakerId == null && !msg.isRoomEvent)) {
        return { role: "assistant", text: trimmed };
      }
      const name = msg.speakerId != null ? speakerNames?.[msg.speakerId] : undefined;
      return { role: "user", text: name ? `${name}: ${trimmed}` : trimmed };
    }

    const speakerName = speakerNames && msg.role !== YOU && msg.speakerId != null ? speakerNames[msg.speakerId] : undefined;
    return {
      role: msg.role === YOU ? "user" : "assistant",
      text: speakerName ? `${speakerName}: ${trimmed}` : trimmed,
    };
  });

  if (!perspective) return mapped;

  const merged: ChatMessage[] = [];
  for (const m of mapped) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) {
      merged[merged.length - 1] = { ...prev, text: `${prev.text}\n\n${m.text}` };
    } else {
      merged.push(m);
    }
  }
  return merged;
};

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

// Stand-in "prompt" used for a character-initiated follow-up (auto, manual,
// participant-strip "reply as X", or regenerating one) when there's no real
// trailing user message to reuse as the prompt. Deliberately says nothing
// about whether time has passed since the last message - the model should
// infer that from the time-awareness section (see buildTimeSection) and only
// treat it as a time-skip when the scene genuinely calls for one.
export const FOLLOWUP_CONTINUATION_PROMPT =
  "Continue the conversation naturally from here, in-character, as the next message in this ongoing exchange.";

// Optional extras for buildSystemInstruction, kept in one object instead of
// growing its positional parameter list further.
export interface PromptOptions {
  roleplayStyle?: RoleplayStyle;
  worldTags?: string[]; // Chat.worldTags - short setting/genre tags for this chat
  roomLoreEntries?: LoreEntry[]; // every OTHER room member's lorebook, matched alongside the speaker's own
  groupPinnedMemory?: string[]; // Chat.pinnedMemory, room only
  now?: number; // injectable clock for the time-awareness section (tests)
}

const describeDuration = (ms: number): string => {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"}`;
};

// Gaps shorter than this read as one continuous conversation and aren't mentioned.
const NOTABLE_GAP_MS = 30 * 60 * 1000;
// A trailing user message younger than this is the one being replied to right
// now, so the relevant gap is the one before it, not "now minus it".
const JUST_SENT_MS = 2 * 60 * 1000;

// Real-world clock context: the current date/time plus how long the user was
// away before this turn, so a character can react to "you vanished for three
// days" instead of carrying on as if no time passed. Worded as pacing-only
// context so a fantasy/sci-fi story with its own calendar isn't dragged into
// the real date.
export const buildTimeSection = (messages: Message[], now: number): string => {
  const stamped = messages.filter((m) => typeof m.timestamp === "number" && !m.isSystem);
  const last = stamped[stamped.length - 1];
  let gap: number | undefined;
  if (last) {
    const justSent = last.role === YOU && now - last.timestamp! < JUST_SENT_MS;
    const prev = justSent ? stamped[stamped.length - 2] : last;
    const reference = justSent ? last.timestamp! : now;
    if (prev) gap = reference - prev.timestamp!;
  }

  const date = new Date(now).toLocaleString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const lines = [`Real-world time for the user: ${date}.`];
  if (gap != null && gap >= NOTABLE_GAP_MS) {
    lines.push(`About ${describeDuration(gap)} passed between the previous message and this one.`);
  }
  lines.push("Use this only for pacing and realism (time of day, how long the user was away). If the story has its own in-world calendar or setting, keep to that instead.");
  return lines.join(" ");
};

const POV_RULES: Record<Exclude<RoleplayStyle["pov"], "auto">, string> = {
  first: "Write your own narration in first person (\"I\").",
  second: "Narrate in second person, addressing the user's character as \"you\".",
  third: "Write narration in third person, referring to yourself by name.",
};

const buildStyleSection = (style: RoleplayStyle, userName: string): string | undefined => {
  const rules: string[] = [];
  if (style.pov !== "auto") rules.push(POV_RULES[style.pov]);
  if (style.actionsInAsterisks) rules.push("Put actions and narration in *asterisks* and spoken dialogue in plain text or quotes.");
  if (style.neverSpeakForUser) rules.push(`Never write dialogue, actions, thoughts or decisions for ${userName}; leave their choices to them.`);
  const custom = style.customInstructions.trim();
  if (custom) rules.push(custom);
  return rules.length > 0 ? `Roleplay rules:\n- ${rules.join("\n- ")}` : undefined;
};

// Assembles the character's system instruction from clearly separated sections
// (persona, user profile, relationship, appearance, long-term memory, and any
// one-off directive like an auto-follow-up nudge) instead of one hand-built
// string. Whitespace is normalized once, here, rather than a second time by
// the caller. {{char}}/{{user}} card macros are resolved in every
// character-authored field.
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
  groupMemory?: string[],
  options: PromptOptions = {}
): SystemInstructionResult => {
  if (!character) return { text: undefined, images: undefined, characterName: undefined };

  const userName = activePersona?.name?.trim() || "the user";
  const m = (text: string | undefined) => applyMacros(text, { char: character.name, user: userName });
  const trimEnd = (text: string) => text.trim().replace(/[.\s]+$/, "");

  const identity = [`You are roleplaying as ${character.name}.`];
  if (character.description?.trim()) identity.push(`Character description: ${trimEnd(m(character.description))}.`);
  identity.push(`Personality & instructions: ${m(character.prompt)}`);
  const sections: string[] = [identity.join("\n")];

  if (character.personalityTraits && character.personalityTraits.length > 0) {
    sections.push(`Key personality traits: ${character.personalityTraits.join(", ")}.`);
  }

  // Only set for a multi-character room (Phase 12) - a normal 1:1 chat never
  // passes this, so its prompt is unchanged. Other speakers' lines arrive
  // labeled with their names (buildChatHistory), so this orients the model to
  // the fact that others exist and it must stay in its own lane rather than
  // narrating or speaking for them.
  const isRoomTurn = Boolean(otherParticipants && otherParticipants.length > 0);
  if (isRoomTurn) {
    sections.push(
      `You are in a group conversation, not a private one-on-one chat. Also present: ${otherParticipants!.join(", ")}. ` +
      `Lines in the conversation history from anyone other than you are prefixed with who said it, purely so you can tell speakers apart - that ` +
      `labeling is added by the app, not something characters actually say out loud. Reply only as yourself, ${character.name}: ` +
      `write your own dialogue/actions directly, with NO leading "${character.name}:" name label of your own, and ` +
      `never write dialogue, actions, or narration for the user or for any other character present.`
    );
  }

  if (options.roleplayStyle) {
    const style = buildStyleSection(options.roleplayStyle, activePersona?.name?.trim() || "the user");
    if (style) sections.push(style);
  }

  // In a room, the shared group scenario (set on the chat itself) replaces
  // this character's own personal scenario - several characters could have
  // wildly different, even contradictory, built-in scenarios, and everyone
  // present should be reacting to the same shared setting instead.
  const effectiveScenario = isRoomTurn ? groupScenario : character.scenario;
  if (effectiveScenario) {
    sections.push(`Current scenario / setting: ${m(effectiveScenario)}`);
  }

  const tags = (options.worldTags || []).map((t) => t.trim()).filter(Boolean);
  if (tags.length > 0) {
    sections.push(`Setting / genre tags for this chat: ${tags.join(", ")}. Keep the story consistent with them.`);
  }

  // A room pools every member's lorebook, so a keyword tied to another
  // character's lore still triggers it when this character is the one replying.
  const loreEntries = [...(character.loreEntries || []), ...(isRoomTurn ? options.roomLoreEntries || [] : [])];
  if (loreEntries.length > 0 && recentMessages) {
    const matched = matchLoreEntries(loreEntries, recentMessages);
    if (matched.length > 0) {
      sections.push(m(buildWorldInfoSection(matched)));
    }
  }

  if (activePersona) {
    const parts: string[] = [];
    if (activePersona.name) parts.push(`User's Name: ${activePersona.name}.`);
    if (activePersona.bio) parts.push(`User's Bio/Details: ${trimEnd(activePersona.bio)}.`);
    if (activePersona.appearance) parts.push(`User's Appearance: ${trimEnd(activePersona.appearance)}.`);
    if (activePersona.backstory) parts.push(`User's Backstory: ${trimEnd(activePersona.backstory)}.`);
    if (parts.length > 0) {
      sections.push(`About the User you are talking to:\n${parts.join(" ")}`);
    }
  }

  if (character.relationship) {
    sections.push(`Your relationship with the user: ${m(character.relationship)}`);
  }
  if (character.appearance) {
    sections.push(`Your physical appearance/looks: ${m(character.appearance)}`);
  }
  const personalFacts = [...(character.pinnedMemory || []), ...(character.memory || [])];
  if (personalFacts.length > 0) {
    sections.push(`Known facts about the user, your relationship and the story so far, remembered from past conversations:\n- ${personalFacts.join("\n- ")}`);
  }
  // Group-room-only: facts learned specifically during this room's own
  // conversation (Chat.memory), on top of - never instead of - the speaker's
  // own personal memory above. Never written back to any participant's own
  // Character.memory, so it stays scoped to this one room.
  const groupFacts = isRoomTurn ? [...(options.groupPinnedMemory || []), ...(groupMemory || [])] : [];
  if (groupFacts.length > 0) {
    sections.push(`Facts learned during this group conversation, shared by everyone here:\n- ${groupFacts.join("\n- ")}`);
  }
  if (character.mes_example) {
    sections.push(
      `Example dialogue showing ${character.name}'s speech style, tone, and formatting (e.g. use of asterisks for actions) - use this only as a style reference, never repeat these lines verbatim:\n${m(character.mes_example)}`
    );
  }
  if (options.roleplayStyle?.timeAwareness && recentMessages) {
    sections.push(buildTimeSection(recentMessages, options.now ?? Date.now()));
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

// Instructions sent AFTER the conversation history (appended to the outgoing
// turn by generateAIResponse) rather than in the system prompt: models weigh
// the end of the context far more heavily than the top, so this is where
// scene direction actually gets followed. Combines the chat's author's note
// with the character card's post_history_instructions.
export const buildPostHistoryNote = (
  character: Character | undefined,
  authorNote: string | undefined,
  activePersona?: UserProfile
): string | undefined => {
  const names = { char: character?.name, user: activePersona?.name?.trim() || "the user" };
  const parts: string[] = [];
  const note = authorNote?.trim();
  if (note) parts.push(`Author's note for the current scene: ${applyMacros(note, names)}`);
  const phi = character?.postHistoryInstructions?.trim();
  if (phi) parts.push(applyMacros(phi, names));
  if (parts.length === 0) return undefined;
  return `[Out-of-character instructions from the user - follow them, but do not reply to or mention them:\n${parts.join("\n")}]`;
};

export interface TurnContext {
  history: ChatMessage[];
  systemInstruction?: string;
  postHistoryNote?: string;
  characterImages?: string[];
  characterName?: string;
  // Every OTHER room participant's reference images, by name - lets an image
  // request in a group chat ("a picture of us together") draw more than just
  // the speaker. Undefined outside a room, same as the fields above.
  otherParticipantImages?: { name: string; images: string[] }[];
}

// Only passed for a multi-character room (Phase 12); a normal 1:1 chat
// passes none of the room fields, so its history comes out as before.
export interface RoomContext {
  speakerNames: Record<number, string>; // characterId -> name, for prefixing history lines
  otherParticipants: string[]; // names of every OTHER character in the room, for the replying character's own system instruction
  otherParticipantImages?: { name: string; images: string[] }[]; // same roster as otherParticipants, paired with their appearance images (Phase: group image gen)
  otherLoreEntries?: LoreEntry[]; // every OTHER member's lorebook entries, matched alongside the speaker's own
  groupScenario?: string; // the room's own Chat.scenario - shared by every participant, replaces the speaker's personal one
  groupMemory?: string[]; // the room's own Chat.memory - facts learned in this room, shared by every participant
  groupPinnedMemory?: string[]; // the room's own Chat.pinnedMemory
}

// Per-chat scene settings and app-wide style, shared by 1:1 chats and rooms.
export interface SceneContext {
  authorNote?: string;
  worldTags?: string[];
  roleplayStyle?: RoleplayStyle;
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
  roomContext?: RoomContext,
  scene?: SceneContext
): TurnContext => {
  const perspective = roomContext && character ? { selfId: character.id, userName: activePersona?.name?.trim() || "User" } : undefined;
  const history = buildChatHistory(messages, roomContext?.speakerNames, perspective);
  const { text, images, characterName } = buildSystemInstruction(
    character, extraDirectives, replyLengthLimit, activePersona, messages, roomContext?.otherParticipants,
    roomContext?.groupScenario, roomContext?.groupMemory,
    {
      roleplayStyle: scene?.roleplayStyle,
      worldTags: scene?.worldTags,
      roomLoreEntries: roomContext?.otherLoreEntries,
      groupPinnedMemory: roomContext?.groupPinnedMemory,
    }
  );
  // The active persona's own reference photos (UserProfile.appearanceImages),
  // folded in as just another named reference alongside any other room
  // participants - so "a picture of us together" keeps the user's face
  // consistent too, in a 1:1 chat as much as a room. Unset when the persona
  // has none, so behavior is unchanged for everyone who hasn't added any.
  const personaReference = activePersona?.appearanceImages && activePersona.appearanceImages.length > 0
    ? { name: activePersona.name, images: activePersona.appearanceImages }
    : undefined;
  const otherParticipantImages = personaReference
    ? [...(roomContext?.otherParticipantImages || []), personaReference]
    : roomContext?.otherParticipantImages;
  return {
    history,
    systemInstruction: text,
    postHistoryNote: buildPostHistoryNote(character, scene?.authorNote, activePersona),
    characterImages: images,
    characterName,
    otherParticipantImages,
  };
};
