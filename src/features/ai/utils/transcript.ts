import { Message } from "../../../types";
import { YOU, AI } from "../../../utils/constants";
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

// Index of the latest compression summary after the seed, or -1. Compression
// no longer deletes what it summarizes - the summary sits in the
// conversation right after those messages - so this is where the part the
// model still needs to see begins.
export const latestSummaryIndex = (messages: Message[]): number => {
  const seed = countSeedMessages(messages);
  for (let i = messages.length - 1; i >= seed; i--) {
    if (messages[i].isCompressionSummary) return i;
  }
  return -1;
};

// What the model is shown of a conversation: the seed, then everything from
// the latest compression summary on. Messages the summary already covers
// stay on screen and in the tree, but are left out of the prompt.
export const trimToLatestSummary = (messages: Message[]): Message[] => {
  const summary = latestSummaryIndex(messages);
  if (summary < 0) return messages;
  return [...messages.slice(0, countSeedMessages(messages)), ...messages.slice(summary)];
};

// The persisted summary pair a compression adds: the summary itself (sent to
// the model as a user turn) plus a hidden acknowledgement, so history still
// alternates. Stamped with the time of the last message it covers rather
// than "now", since it sits at that point in the conversation.
export const buildSummaryMessages = (summary: string, timestamp?: number, chapter?: { title: string; recap?: string }): Message[] => [
  {
    role: YOU,
    txt: `Earlier conversation summary (treat as established context, continue naturally):\n\n${summary}`,
    isCompressionSummary: true,
    ...(chapter ? { chapterTitle: chapter.title, chapterRecap: chapter.recap } : {}),
    timestamp: timestamp ?? Date.now(),
  },
  { role: AI, txt: "Understood, continuing from that context.", isSystem: true, timestamp: timestamp ?? Date.now() },
];

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

// Extra instructions for an "End chapter" summary: a title and a recap of
// just this chapter, ahead of the usual whole-story summary.
export const CHAPTER_INSTRUCTIONS = `This marks the end of a chapter. Before the summary, write exactly these two lines:
TITLE: a short, evocative title (2 to 6 words) for the part of the story since any earlier summary
RECAP: two or three sentences recapping only that part
Then a line with just SUMMARY: followed by the summary itself.`;

// Reads a chapter reply back. Missing markers degrade gracefully: the whole
// reply is the summary, and the recap is its first couple of sentences.
export const parseChapterReply = (reply: string): { title?: string; recap?: string; summary: string } => {
  const text = reply.trim();
  const title = text.match(/^\s*\**TITLE\**\s*:\s*(.+)$/im)?.[1].replace(/^["*\s]+|["*\s]+$/g, "").trim();
  // "**RECAP:**" puts the closing bold after the colon, hence the \** there.
  const recap = text.match(/^\s*\**RECAP\**\s*:\s*\**\s*([\s\S]*?)(?=^\s*\**SUMMARY\**\s*:|$(?![\s\S]))/im)?.[1].trim();
  const summaryMatch = text.match(/^\s*\**SUMMARY\**\s*:\s*\**\s*([\s\S]*)$/im);
  const summary = (summaryMatch ? summaryMatch[1] : text).trim();
  const fallbackRecap = summary.replace(/^[^:\n]*:\s*/, "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  return { title: title || undefined, recap: recap || fallbackRecap || undefined, summary };
};
