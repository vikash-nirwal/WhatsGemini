import { Message } from "../../types";
import { YOU } from "../../utils/constants";

// Who reacted to a message (#11; the user's report, 2026-10-28: in a group
// there was no way to see it). A message kept one character's reaction, so
// in a group each new one replaced the last, and members never reacted to
// each other. Now every character's is kept, one per character, on any
// message - yours or another member's - next to your own (`reaction`), and
// the badge opens to say who reacted with what.

export interface CharacterReaction {
  emoji: string;
  by: number;
}

// Every character's reaction, with the one kept the old way
// (`characterReaction`) folded in.
export const characterReactionsOf = (msg: Pick<Message, "reactions" | "characterReaction">): CharacterReaction[] => {
  const list = [...(msg.reactions || [])];
  const old = msg.characterReaction;
  // -1: an old 1:1 reaction that didn't say whose (it's the chat's character).
  if (old && !list.some((r) => r.by === (old.speakerId ?? -1))) list.unshift({ emoji: old.emoji, by: old.speakerId ?? -1 });
  return list;
};

// This character's reaction set, changed, or (with no emoji) taken back.
export const withCharacterReaction = (msg: Pick<Message, "reactions" | "characterReaction">, by: number, emoji: string | undefined): Pick<Message, "reactions" | "characterReaction"> => {
  const rest = characterReactionsOf(msg).filter((r) => r.by !== by);
  const reactions = emoji ? [...rest, { emoji, by }] : rest;
  return { reactions: reactions.length ? reactions : undefined, characterReaction: undefined };
};

const spoken = (m: Message) => !m.isSystem && !m.isNarration && !m.isRoomEvent && !m.isCompressionSummary && !m.godMode;

// What a reply's reaction is to: your last message in a 1:1; in a group,
// the last message someone else sent - yours or another member's.
export const reactionTarget = (messages: Message[], speakerId: number | undefined, inRoom: boolean): Message | undefined => {
  const said = messages.filter(spoken);
  if (!inRoom) return [...said].reverse().find((m) => m.role === YOU);
  return [...said].reverse().find((m) => m.role === YOU || (m.speakerId != null && m.speakerId !== speakerId));
};

export interface ReactionRow {
  emoji: string;
  who: string;
  you?: boolean;
}

// Everyone's reactions on one message, yours first, for its badge and list.
export const reactionRows = (msg: Message, nameOf: (id: number | undefined) => string): ReactionRow[] => [
  ...(msg.reaction && msg.role !== YOU ? [{ emoji: msg.reaction, who: "You", you: true }] : []),
  ...characterReactionsOf(msg).map((r) => ({ emoji: r.emoji, who: nameOf(r.by === -1 ? undefined : r.by) })),
];

// The badge: each emoji once, most used first, and how many reacted.
export const reactionSummary = (rows: ReactionRow[]) => {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
  return { emojis: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([e]) => e).slice(0, 3), total: rows.length };
};
