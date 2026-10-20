import { ChatRecap, Message } from "../../types";

// "Previously on..." (#46): coming back to a chat after a few days away
// shows a short recap of where the story stands. It's written once per
// return and cached on the chat (Chat.recap), keyed by the last message it
// covers, so reopening the chat doesn't pay for it again. It's only for the
// user: it's never a message and never reaches the model.

export const DEFAULT_RECAP_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
// Too little story to recap: the user can just scroll up.
const MIN_MESSAGES = 4;
const RECENT_MESSAGES = 12;

const visibleMessages = (messages: Message[]) => messages.filter((m) => !m.isSystem && !m.isRefusal);

export type RecapDecision =
  | { kind: "none" }
  | { kind: "cached"; recap: ChatRecap }
  | { kind: "generate"; forMessageId: string };

export const decideRecap = (messages: Message[], recap: ChatRecap | undefined, now: number, afterDays: number): RecapDecision => {
  if (afterDays <= 0) return { kind: "none" };
  const visible = visibleMessages(messages);
  const last = visible[visible.length - 1];
  if (!last?.id || !last.timestamp || visible.length < MIN_MESSAGES) return { kind: "none" };
  if (now - last.timestamp < afterDays * DAY_MS) return { kind: "none" };
  if (recap && recap.forMessageId === last.id) return recap.dismissed ? { kind: "none" } : { kind: "cached", recap };
  return { kind: "generate", forMessageId: last.id };
};

// The newest summary's text: a chapter recap when there is one (short and
// already written for a reader), otherwise the compression summary itself.
export const latestStorySummary = (messages: Message[]): string | undefined => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.isCompressionSummary) continue;
    if (m.chapterRecap?.trim()) return m.chapterRecap.trim();
    return (m.txt || "").replace(/^Earlier conversation summary[^\n]*\n+/i, "").trim() || undefined;
  }
  return undefined;
};

// The messages after the newest summary, the last few of them.
export const recentForRecap = (messages: Message[]): Message[] => {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].isCompressionSummary) {
      start = i + 1;
      break;
    }
  }
  return visibleMessages(messages.slice(start)).slice(-RECENT_MESSAGES);
};

export const buildRecapPrompt = (transcript: string, summary: string | undefined, charName: string, userName: string): string =>
  `${userName} is coming back to a roleplay with ${charName} after a few days away. Write a short "Previously on..." recap so they can pick up where they left off.

- 2 to 4 sentences, past tense, speaking to ${userName} as "you" and naming the characters.
- Only what already happened. End on where things stand right now, at the last moment of the story.
- No new events, no questions, no headings, no quotes from the chat.
${summary ? `\nThe story so far:\n${summary}\n` : ""}
Most recent messages:
${transcript}`;

export const cleanRecap = (reply: string): string =>
  reply
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .replace(/^(previously on[^:\n]*[:.]|recap:)\s*/i, "")
    .trim();
