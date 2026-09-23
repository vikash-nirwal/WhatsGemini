import { Message } from "../../../types";
import { YOU } from "../../../utils/constants";
import { ChatMessage } from "../types";
import { stripLeakedBase64 } from "./apiUtils";

// Who's who in a transcript handed to a summarization/memory-extraction call.
// Labeling lines with real names (rather than "User"/"AI") is what lets the
// resulting summary or facts say "Mira promised Arin..." instead of a vague
// "the AI promised the user...".
export interface TranscriptNames {
  userName?: string;
  charName?: string; // the chat's (primary) character
  speakerNames?: Record<number, string>; // room members by id, for Message.speakerId
}

// Renders stored messages as "Name: text" lines for one-shot helper prompts.
// Hidden priming messages are skipped; a previous compression summary is
// passed through as a labeled block so it can be folded into the new one.
export const formatTranscript = (messages: Message[], names: TranscriptNames = {}): string =>
  messages
    .filter((m) => !m.isSystem && !m.isRefusal)
    .map((m) => {
      const text = stripLeakedBase64(m.txt || "").trim();
      if (m.isCompressionSummary) return `[Summary of earlier events]\n${text}`;
      if (m.isRoomEvent) return `[${text}]`;
      const speaker = m.role === YOU
        ? names.userName || "User"
        : (m.speakerId != null ? names.speakerNames?.[m.speakerId] : undefined) || names.charName || "Character";
      return `${speaker}: ${text}`;
    })
    .join("\n\n");

// Most providers require (or strongly prefer) history to end on an assistant
// turn before the new prompt. Splits off any trailing unanswered user turns
// and returns their text (oldest first) so the caller can prepend it to the
// outgoing prompt - they used to be silently dropped, losing e.g. the first of
// two back-to-back user messages, or other room members' lines.
export const splitTrailingUserMessages = (validHistory: ChatMessage[]): { history: ChatMessage[]; trailingText: string } => {
  const trailing: string[] = [];
  const history = [...validHistory];
  while (history.length > 0 && history[history.length - 1].role === "user") {
    trailing.unshift(history.pop()!.text);
  }
  return { history, trailingText: trailing.filter((t) => t.trim()).join("\n\n") };
};
