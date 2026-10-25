import { Character, Chat, Message } from "../../types";
import { lifeScaled } from "../life/lifeDial";

// Blocking, both ways (#133).
// You block them: their texts and statuses stop reaching you and they can't
// text first; now and then a friend you share brings it up in your chat
// with them and talks it through, in their own voice. Unblocking is yours.
// They block you: after a bad enough fight a character can block you
// ([Block] at the end of a reply). Your messages then get one grey tick and
// no reply, and their photo, About and online state disappear for you. To
// make up you go through someone who knows you both, who can patch it up
// ([Patched up: Name]).

export type Block = NonNullable<Chat["blocked"]>;

export const blockedByYou = (chat: Pick<Chat, "blocked"> | undefined): boolean => chat?.blocked?.by === "you";
export const blockedByThem = (chat: Pick<Chat, "blocked"> | undefined): boolean => chat?.blocked?.by === "them";

// The 1:1 chat with a character (not a what-if or a chat with its own memory).
export const mainChatWith = (chats: Chat[], characterId: number): Chat | undefined =>
  chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === characterId && !c.whatIf && c.memoryScope !== "chat");

// Whether a character is blocked by you, in their main chat.
export const isBlockedCharacter = (chats: Chat[], characterId: number): boolean => blockedByYou(mainChatWith(chats, characterId));

// Friends you share with a character: someone who knows them (#74) or is in
// a group with them, and has a chat of their own with you.
export const mutualFriends = (blocked: Character, characters: Character[], chats: Chat[]): Character[] =>
  characters.filter((c) => {
    if (c.id === blocked.id || !mainChatWith(chats, c.id) || blockedByYou(mainChatWith(chats, c.id)) || blockedByThem(mainChatWith(chats, c.id))) return false;
    const inGroup = chats.some((g) => (g.characterIds?.length || 0) > 1 && g.characterIds!.includes(c.id) && g.characterIds!.includes(blocked.id));
    return inGroup || c.knowsAbout?.includes(blocked.id) || blocked.knowsAbout?.includes(c.id);
  });

// A friend brings a block of yours up: not in the first 12 hours, then at
// most every two days (scaled by the life dial).
const FIRST_NUDGE_MS = 12 * 60 * 60 * 1000;
const NUDGE_GAP_MS = 48 * 60 * 60 * 1000;
export const goBetweenDue = (chat: Pick<Chat, "blocked">, now: number): boolean => {
  const block = chat.blocked;
  if (!block || block.by !== "you") return false;
  if (now - block.at < lifeScaled(FIRST_NUDGE_MS)) return false;
  return !block.nudgedAt || now - block.nudgedAt >= lifeScaled(NUDGE_GAP_MS);
};

const about = (c: Pick<Character, "description" | "prompt">) => [c.description, c.prompt].filter(Boolean).join(" ").slice(0, 300);

// The friend's opening message about it, in your chat with them.
export const buildGoBetweenPrompt = (friend: Character, blocked: Character, userName: string, context: { fight?: string; recent?: string }): string =>
  `You are ${friend.name} (${about(friend)}), texting ${userName}.
${userName} has blocked ${blocked.name} (${about(blocked)}).${context.fight ? ` From what you know, it was about: ${context.fight}.` : ""}
${blocked.name} reached out to you and asked you to put in a word.${context.recent ? `\nYour latest messages with ${userName}:\n${context.recent}` : ""}

Write ${friend.name}'s text to ${userName} bringing it up: pass on that ${blocked.name} asked, and say what you honestly think, in your own voice, from what you know of both of them - you may take a side, or not. Don't pressure; it's ${userName}'s call. One to three short texts' worth, no quotation marks, no name prefix.`;

// For the friend's replies in that chat: they know about it and can talk it through.
export const buildGoBetweenNote = (friendName: string, blockedName: string, userName: string): string =>
  `${userName} has blocked ${blockedName}, and ${blockedName} asked ${friendName} to put in a word. If it comes up, ${friendName} can talk it through honestly - why ${userName} might or might not unblock - in ${friendName}'s own voice. Unblocking is ${userName}'s call.`;

// For a character who blocked you: they're done talking (no reply goes out).
// For their friends: who blocked whom, so you can ask them to help.
export const buildBlockedYouNote = (friendName: string, blockerName: string, userName: string): string =>
  `${blockerName} blocked ${userName} after a bad fight. ${friendName} knows both of them. If ${userName} asks ${friendName} for help and ${friendName} talks to ${blockerName} and patches it up (only if ${userName} seems sincere), end that reply with [Patched up: ${blockerName}] on its own line.`;

export const buildBlockDirective = (name: string, userName: string): string =>
  `If ${userName} goes much too far during this fight - cruel, threatening, or after real attempts to fix it they keep making it worse - ${name} can block them: say it in the reply, and add [Block] on its own line at the very end. Only as a last resort.`;

const BLOCK_TAG = /\n*\[\s*block\s*\]\s*$/i;
const PATCHED_TAG = /\n*\[\s*patched up\s*:\s*([^\]\n]{1,40})\]\s*$/i;
const PARTIAL = /\n*\[\s*(block|patched up)[^\]\n]*$/i;

export const extractBlockTags = (text: string): { text: string; blocks?: boolean; patchedUp?: string } => {
  const patched = text.match(PATCHED_TAG);
  if (patched) return { text: text.slice(0, patched.index).trimEnd(), patchedUp: patched[1].trim() };
  const block = text.match(BLOCK_TAG);
  if (block) return { text: text.slice(0, block.index).trimEnd(), blocks: true };
  return { text };
};

export const stripStreamingBlockTags = (text: string): string => text.replace(PATCHED_TAG, "").replace(BLOCK_TAG, "").replace(PARTIAL, "");

// Your messages since they blocked you show one grey tick.
export const sentWhileBlocked = (chat: Pick<Chat, "blocked">, message: Message): boolean =>
  blockedByThem(chat) && Boolean(message.timestamp && message.timestamp >= chat.blocked!.at);

// The notes for a friend's chat: they know you blocked someone and were
// asked to put in a word, or that someone blocked you and they could help.
export const blockNotesFor = (friend: Character, characters: Character[], chats: Chat[], userName: string): string | undefined => {
  const notes: string[] = [];
  for (const other of characters) {
    if (other.id === friend.id) continue;
    const chat = mainChatWith(chats, other.id);
    if (blockedByYou(chat) && chat!.blocked!.nudgedBy === friend.id) notes.push(buildGoBetweenNote(friend.name, other.name, userName));
    if (blockedByThem(chat) && mutualFriends(other, characters, chats).some((f) => f.id === friend.id)) notes.push(buildBlockedYouNote(friend.name, other.name, userName));
  }
  return notes.length > 0 ? notes.join("\n") : undefined;
};

// Blocked either way: no statuses or first texts between you (#133).
export const blockedEitherWay = (chats: Chat[], characterId: number): boolean => Boolean(mainChatWith(chats, characterId)?.blocked);
