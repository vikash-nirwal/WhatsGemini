import { Message } from "../../types";
import { AI, YOU } from "../../utils/constants";

// Message info (#121): for a message of yours, when it was sent, delivered
// and read, like WhatsApp's "Message info". Delivered is when it was sent
// (the app has no network to wait on); read is when each character first
// answered after it. In a group chat, each member reads it when they reply.

export interface ReadReceipt {
  speakerId?: number;
  readAt?: number;
}

export interface MessageInfo {
  sentAt?: number;
  deliveredAt?: number;
  reads: ReadReceipt[];
}

export const messageInfoFor = (messages: Message[], index: number, memberIds: number[]): MessageInfo | undefined => {
  const msg = messages[index];
  if (!msg || msg.role !== YOU || msg.isNarration) return undefined;
  const later = messages.slice(index + 1).filter((m) => m.role === AI && !m.isSystem && !m.isImpersonated);
  const firstFrom = (id?: number) => later.find((m) => id == null || m.speakerId == null || m.speakerId === id)?.timestamp;
  const reads: ReadReceipt[] = memberIds.length > 1 ? memberIds.map((id) => ({ speakerId: id, readAt: firstFrom(id) })) : [{ speakerId: memberIds[0], readAt: firstFrom() }];
  return { sentAt: msg.timestamp, deliveredAt: msg.timestamp, reads };
};
