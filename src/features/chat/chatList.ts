import { Chat, Message } from "../../types";
import { AI, YOU } from "../../utils/constants";

// A WhatsApp chat list (#115): unread counts, the last message's preview
// and the archived row. Display only; the chat page sets `readAt`.

// Messages a person would see as the conversation: not summaries, system
// notes, narration lines or room events.
const conversation = (content: Message[] | undefined): Message[] =>
  (content || []).filter((m) => !m.isSystem && !m.isCompressionSummary && !m.isNarration && !m.isRoomEvent);

// Replies since you last looked. A chat never opened since this existed
// has no `readAt`; there only the texts they sent first since you last
// wrote count, so old chats don't all light up at once.
export const unreadCount = (chat: Pick<Chat, "content" | "readAt">): number => {
  const messages = conversation(chat.content);
  if (chat.readAt != null) return messages.filter((m) => m.role === AI && (m.timestamp || 0) > chat.readAt!).length;
  let count = 0;
  for (let i = messages.length - 1; i >= 0 && messages[i].role === AI; i--) {
    if (messages[i].notes?.includes("texted-first")) count++;
  }
  return count;
};

export interface ChatPreview {
  text: string;
  fromYou: boolean;
  speakerId?: number;
}

const PREVIEW_MAX = 90;
// Same as imageGeneration's stripImageContextTag, kept here so the list
// doesn't load the AI client.
const IMAGE_CONTEXT_TAG = /\n*\[Image Context:[\s\S]*?\]\s*$/i;

// The last message, as one plain line: no markdown marks, a photo or a
// voice note said in words, the way WhatsApp's list shows them.
export const lastPreview = (chat: Pick<Chat, "content">): ChatPreview | undefined => {
  const messages = conversation(chat.content);
  const last = messages[messages.length - 1];
  if (!last) return undefined;
  const plain = (last.txt || "").replace(IMAGE_CONTEXT_TAG, "")
    .replace(/[*_~`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let text = plain;
  if (last.isVoiceNote) text = "🎤 Voice message";
  else if (!plain && last.images?.length) text = "📷 Photo";
  else if (!plain && last.videos?.length) text = "🎥 Video";
  else if (last.images?.length) text = `📷 ${plain}`;
  if (text.length > PREVIEW_MAX) text = `${text.slice(0, PREVIEW_MAX - 1).trimEnd()}…`;
  return { text, fromYou: last.role === YOU, speakerId: last.speakerId };
};

// Archived chats leave the main list for an "Archived" row, unless a
// search is on (search finds them anyway).
export const splitArchived = <T extends { chat: Pick<Chat, "archived"> }>(items: T[], searching: boolean): { shown: T[]; archived: T[] } =>
  searching ? { shown: items, archived: [] } : { shown: items.filter((i) => !i.chat.archived), archived: items.filter((i) => i.chat.archived) };
