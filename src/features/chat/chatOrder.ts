import { Chat } from "../../types";

// The chat list, as in a messaging app (the user's ask, 2026-10-26): the
// chat with the latest message on top, and the time shown is that message's.
// A chat with no messages yet counts from when it was made. Messages that
// haven't happened yet (a reply scheduled for later) don't count.
export const lastActivity = (chat: Pick<Chat, "content" | "timestamp">, now = Date.now()): number => {
  const content = chat.content || [];
  for (let i = content.length - 1; i >= 0; i--) {
    const at = content[i].timestamp;
    if (at && at <= now) return Math.max(at, 0);
  }
  return chat.timestamp || 0;
};

export const byLastActivity = <T extends { chat: Pick<Chat, "content" | "timestamp"> }>(items: T[], now = Date.now()): T[] =>
  [...items].sort((a, b) => lastActivity(b.chat, now) - lastActivity(a.chat, now));
