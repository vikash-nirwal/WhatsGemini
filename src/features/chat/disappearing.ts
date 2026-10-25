import { Chat, ConversationTree, Message } from "../../types";
import { findDefaultLeafFrom, flattenPath, removeNodes } from "./messageTree";

// Disappearing messages (#136): per chat, messages sent after it's turned on
// vanish a day or a week after they were sent - from the chat and from what
// the model sees. Notices (room events) and summaries stay. The character
// knows it's on, and memory isn't updated from those messages.

export type DisappearAfter = "day" | "week";
const DAY = 24 * 60 * 60 * 1000;
export const DISAPPEAR_MS: Record<DisappearAfter, number> = { day: DAY, week: 7 * DAY };
export const DISAPPEAR_LABEL: Record<DisappearAfter, string> = { day: "1 day", week: "1 week" };

// Whether this message will vanish once its time is up.
export const willDisappear = (chat: Pick<Chat, "disappearing">, message: Message): boolean =>
  Boolean(chat.disappearing && message.timestamp && message.timestamp >= chat.disappearing.since && !message.isRoomEvent && !message.isCompressionSummary);

const isExpired = (chat: Pick<Chat, "disappearing">, message: Message, now: number): boolean =>
  willDisappear(chat, message) && now - (message.timestamp || 0) >= DISAPPEAR_MS[chat.disappearing!.after];

// The chat without its expired messages, or null when nothing has expired.
export const pruneDisappeared = (
  chat: Pick<Chat, "disappearing" | "content" | "tree" | "activeLeafId">,
  now: number
): { content: Message[]; tree?: ConversationTree; activeLeafId?: string | null } | null => {
  if (!chat.disappearing) return null;
  if (chat.tree) {
    const expired = new Set(Object.values(chat.tree.nodes).filter((n) => isExpired(chat, n.message, now)).map((n) => n.id));
    if (expired.size === 0) return null;
    const tree = removeNodes(chat.tree, expired);
    // The active path's last kept message, then down its newest branch.
    let leaf = chat.activeLeafId ?? null;
    while (leaf && expired.has(leaf)) leaf = chat.tree.nodes[leaf]?.parentId ?? null;
    const activeLeafId = leaf ? findDefaultLeafFrom(tree, leaf) : null;
    return { content: activeLeafId ? flattenPath(tree, activeLeafId) : [], tree, activeLeafId };
  }
  const content = chat.content.filter((m) => !isExpired(chat, m, now));
  return content.length === chat.content.length ? null : { content };
};

export const disappearingNotice = (after: DisappearAfter, characterName: string): string =>
  `You turned on disappearing messages. New messages vanish ${DISAPPEAR_LABEL[after]} after they're sent; ${characterName} won't keep them as memories.`;
export const DISAPPEARING_OFF_NOTICE = "You turned off disappearing messages.";

// For the system prompt: the character knows, which can make them franker.
export const buildDisappearingNote = (after: DisappearAfter, characterName: string, userName: string): string =>
  `Disappearing messages are on in this chat: every message vanishes ${DISAPPEAR_LABEL[after]} after it's sent, and neither of you keeps a record. ${characterName} knows this, and may be a little franker or more playful because of it - or tease ${userName} about what they'd say "off the record".`;
