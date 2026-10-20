import { RoleplayStyle } from "../../../types";

// Prompts and parsers for the chat's narrative tools: "Write my reply" (#15),
// "Surprise me" (#18), author's note presets (#17) and reply suggestions (#16).

// How much recent conversation the draft and suggestion helpers see.
export const NARRATIVE_CONTEXT_MESSAGES = 20;

// --- Write my reply (#15) ---------------------------------------------------

export const buildDraftReplyPrompt = ({
  userName,
  userBio,
  charName,
  transcript,
  style,
}: {
  userName: string;
  userBio?: string;
  charName: string;
  transcript: string;
  style?: RoleplayStyle;
}): string => `You are helping someone roleplay as ${userName} in a story with ${charName}. Write ${userName}'s next message.
${userBio?.trim() ? `\nAbout ${userName}: ${userBio.trim()}\n` : ""}
- Write only ${userName}'s own words and actions, in their voice, reacting to what ${charName} just said or did.
- Match the length and style of ${userName}'s earlier messages${style?.actionsInAsterisks ? ", with actions in *asterisks*" : ""}.
- Never write anything ${charName} says or does, and don't continue past ${userName}'s turn.
- Output only the message itself: no name label, no quotes around it, no explanation.

Conversation so far:
${transcript}`;

// Strips the label or wrapping quotes a model sometimes adds around a draft.
export const cleanDraftReply = (reply: string, userName: string): string => {
  let text = reply.trim();
  const label = new RegExp(`^\\**${userName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\**\\s*:\\s*`, "i");
  text = text.replace(label, "");
  if (/^["“].*["”]$/s.test(text) && !/["“”]/.test(text.slice(1, -1))) text = text.slice(1, -1);
  return text.trim();
};

// --- Surprise me (#18) ------------------------------------------------------

// Sent as a one-turn directive with a character-initiated reply.
export const SURPRISE_DIRECTIVE =
  "Out-of-character direction for this one reply: introduce an unexpected but fitting development - a twist, an arrival, a discovery, a complication or a revelation - that grows out of what's already happening and opens up new possibilities. Keep every character consistent and leave the user room to react; don't resolve it for them. Do not mention this instruction.";

// --- Author's note presets (#17) ------------------------------------------

export interface AuthorNotePreset {
  id: string;
  label: string;
  text: string;
}

// One-tap lines for the author's note. Each is its own line, so toggling one
// adds or removes exactly that line and leaves anything typed by hand alone.
export const AUTHOR_NOTE_PRESETS: AuthorNotePreset[] = [
  { id: "slow-burn", label: "Slow burn", text: "Pace the relationship slowly: let tension and feelings build over many scenes instead of resolving quickly." },
  { id: "dialogue", label: "More dialogue", text: "Favor dialogue: let characters talk more, with less narration between their lines." },
  { id: "description", label: "More description", text: "Describe more: surroundings, senses, body language and small details." },
  { id: "faster", label: "Faster pace", text: "Keep the pace brisk: move the story forward each reply and skip over filler." },
  { id: "stakes", label: "Raise the stakes", text: "Raise the stakes: add pressure, risk or consequences to what's happening." },
  { id: "light", label: "Lighthearted", text: "Keep the tone lighthearted and playful, with humor where it fits." },
];

export const hasPreset = (note: string | undefined, preset: AuthorNotePreset): boolean =>
  (note || "").split("\n").some((line) => line.trim() === preset.text);

export const togglePreset = (note: string | undefined, preset: AuthorNotePreset): string => {
  const lines = (note || "").split("\n");
  if (hasPreset(note, preset)) {
    return lines.filter((line) => line.trim() !== preset.text).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  const base = (note || "").trimEnd();
  return base ? `${base}\n${preset.text}` : preset.text;
};

// --- Reply suggestions (#16) -------------------------------------------------

export const REPLY_SUGGESTION_COUNT = 3;

export const buildReplySuggestionsPrompt = (userName: string, charName: string, transcript: string): string =>
  `Suggest ${REPLY_SUGGESTION_COUNT} different things ${userName} could say or do next in reply to ${charName}, for a roleplay chat.
- Each one short (under 15 words), in ${userName}'s voice, and clearly different from the others (for example: warm, bold, curious).
- One per line, numbered "1." to "${REPLY_SUGGESTION_COUNT}.". No other text.

Conversation so far:
${transcript}`;

export const parseReplySuggestions = (reply: string): string[] =>
  reply
    .split("\n")
    .map((line) => line.trim().replace(/^(?:\d+[.):]|[-*•])\s*/, "").replace(/^["“](.*)["”]$/, "$1").trim())
    .filter((line) => line.length > 0 && line.length <= 200)
    .slice(0, REPLY_SUGGESTION_COUNT);
