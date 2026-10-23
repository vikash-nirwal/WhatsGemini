import { Character, Chat } from "../../types";
import { YOU } from "../../utils/constants";

// Jealousy (#99): with the switch on, when you come back to a 1:1 chat after
// chatting a lot with other characters, the character can notice - worked
// out from real timestamps, nothing stored. They know who it was only for
// characters they know of (#74); anyone else is "someone". How they take it
// follows their personality, the relationship stage (#70) and the jealousy
// line of their romance profile (#73). It's a note for the first reply after
// you return, so it comes up once.

export const AWAY_MS = 60 * 60 * 1000; // at least an hour since you last talked here
export const BUSY_MESSAGES = 8; // and this many of your messages elsewhere

export interface TimeElsewhere {
  known: string[]; // names of characters this one knows of
  unknown: number; // other characters, unnamed
  messages: number;
  since: number;
}

export const timeElsewhere = (character: Character, chat: Chat, chats: Chat[], characters: Character[], now: number): TimeElsewhere | undefined => {
  const real = (chat.content || []).filter((m) => !m.isSystem && !m.isCompressionSummary);
  const since = real[real.length - 1]?.timestamp;
  if (!since || now - since < AWAY_MS) return undefined;
  const byCharacter = new Map<number, number>();
  for (const other of chats) {
    const otherId = other.characterIds?.length === 1 ? other.characterIds[0] : undefined;
    if (other.id === chat.id || otherId == null || otherId === character.id) continue;
    const sent = (other.content || []).filter((m) => m.role === YOU && !m.isNarration && (m.timestamp || 0) > since).length;
    if (sent > 0) byCharacter.set(otherId, (byCharacter.get(otherId) || 0) + sent);
  }
  const messages = Array.from(byCharacter.values()).reduce((a, b) => a + b, 0);
  if (messages < BUSY_MESSAGES) return undefined;
  const knows = new Set(character.knowsAbout || []);
  const known = Array.from(byCharacter.keys())
    .filter((id) => knows.has(id))
    .map((id) => characters.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return { known, unknown: byCharacter.size - known.length, messages, since };
};

export const buildJealousyNote = (character: Character, userName: string, away: TimeElsewhere, now: number): string => {
  const hours = Math.max(1, Math.round((now - away.since) / 3_600_000));
  const who = [...away.known, ...(away.unknown > 0 ? [away.unknown === 1 ? "someone else" : "a few others"] : [])].join(" and ");
  const style = character.intimacy?.jealousy?.trim();
  return `Since you and ${userName} last talked (${hours} hour${hours === 1 ? "" : "s"} ago), ${userName} has been busy chatting with ${who} - you can tell. ${character.name} may notice: tease, sulk a little, play it cool, ask about it, or not mind at all, whatever fits ${character.name}'s personality and how close you are${style ? ` (how ${character.name} handles jealousy: ${style})` : ""}. A line or two at most, only in this reply, and never claim to know what was said.`;
};

export const jealousyNoteFor = (character: Character | undefined, chat: Chat | undefined, chats: Chat[], characters: Character[], userName: string, now: number): string | undefined => {
  if (!character || !chat?.jealousy || chat.stage === "strangers") return undefined;
  const away = timeElsewhere(character, chat, chats, characters, now);
  return away ? buildJealousyNote(character, userName, away, now) : undefined;
};
