import { Message } from "../../../types";
import { YOU } from "../../../utils/constants";
import { ChatMessage } from "../types";
import { stripLeakedBase64 } from "./apiUtils";
import { estimateMessageTokens } from "./tokenEstimator";

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

// How many hidden priming messages this chat was seeded with - the global
// "initial messages" are copied in, flagged isSystem, only when a chat starts
// without a character greeting. Read off the chat itself rather than the
// current global setting: a greeting-seeded chat has none, and the setting
// may have changed since the chat was created.
export const countSeedMessages = (messages: Message[]): number => {
  let i = 0;
  while (i < messages.length && messages[i].isSystem && !messages[i].isCompressionSummary) i++;
  return i;
};

// Leading messages that history truncation must never drop: the seed, plus
// the compression summary and its hidden acknowledgement right after it -
// cutting the summary would throw away everything it stands for.
export const countProtectedPrefix = (messages: Message[]): number => {
  let i = countSeedMessages(messages);
  if (messages[i]?.isCompressionSummary) {
    i++;
    if (messages[i]?.isSystem) i++;
  }
  return i;
};

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

// Hard-caps history to maxHistoryTokens estimated tokens, splicing out the
// oldest unprotected messages once it's exceeded (used as a backstop alongside/
// instead of compression). Walks backwards from the newest message,
// accumulating estimated tokens, so the messages that survive are always the
// most recent ones that fit - the newest message always stays regardless of
// its own size, so truncation never empties the history entirely.
//
// `protectedCount` is how many leading messages always survive - the caller
// works it out from the chat's own messages (countProtectedPrefix). With none
// to protect, the first message (usually the greeting) is kept, as before.
export const truncateHistory = (validHistory: ChatMessage[], maxHistoryTokens: number, protectedCount = 0): ChatMessage[] => {
  if (maxHistoryTokens <= 0) return validHistory;

  const startIndex = Math.max(protectedCount, 1);
  if (startIndex >= validHistory.length) return validHistory;

  let tokens = 0;
  let cutoff = startIndex;
  for (let i = validHistory.length - 1; i >= startIndex; i--) {
    const msgTokens = estimateMessageTokens(validHistory[i].text);
    const isNewest = i === validHistory.length - 1;
    if (!isNewest && tokens + msgTokens > maxHistoryTokens) {
      cutoff = i + 1;
      break;
    }
    tokens += msgTokens;
    cutoff = i;
  }

  if (cutoff > startIndex) {
    validHistory.splice(startIndex, cutoff - startIndex);
  }
  return validHistory;
};
