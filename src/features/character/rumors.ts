import { Character, Chat, Rumor } from "../../types";
import { YOU } from "../../utils/constants";

// Rumors (#98): with "What you tell them can get around" on, now and then a
// helper turns something from that character's 1:1 chat with you into a
// rumor - a little wrong, the way rumors go - that reaches a character who
// knows of them (#74) or shares a group chat with them. That character
// brings it up with you, in their own chat or a group, reacting to what they
// heard; the reply that does adds [Rumor raised].

export const RUMOR_GAP_MS = 20 * 60 * 60 * 1000; // per source character
export const RUMOR_FRESH_MS = 7 * 24 * 60 * 60 * 1000; // after this an unraised rumor is old news
const MIN_NEW_MESSAGES = 6;
const KEEP = 5;

export const newRumorId = () => `rumor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// The characters a rumor from `source` can reach.
export const rumorListenersFor = (source: Character, characters: Character[], chats: Chat[]): Character[] =>
  characters.filter(
    (c) =>
      c.id !== source.id &&
      ((c.knowsAbout || []).includes(source.id) ||
        chats.some((chat) => (chat.characterIds || []).length > 1 && chat.characterIds!.includes(c.id) && chat.characterIds!.includes(source.id)))
  );

// When the last rumor from this source went out, from what the others heard.
export const lastRumorFrom = (sourceId: number, characters: Character[]): number =>
  characters.reduce((t, c) => Math.max(t, ...(c.rumors || []).filter((r) => r.fromId === sourceId).map((r) => r.at)), 0);

export const rumorDue = (source: Character, chat: Chat | undefined, characters: Character[], chats: Chat[], now: number): boolean => {
  if (!source.spreadsRumors || !chat) return false;
  const last = lastRumorFrom(source.id, characters);
  if (last && now - last < RUMOR_GAP_MS) return false;
  const fresh = (chat.content || []).filter((m) => m.role === YOU && !m.isSystem && !m.isNarration && (m.timestamp || 0) > last).length;
  if (fresh < MIN_NEW_MESSAGES) return false;
  return rumorListenersFor(source, characters, chats).length > 0;
};

// The listener with the fewest rumors waiting to be raised.
export const pickListener = (listeners: Character[], now: number): Character | undefined =>
  [...listeners].sort((a, b) => pendingRumors(a, now).length - pendingRumors(b, now).length)[0];

export const buildRumorPrompt = (sourceName: string, listenerName: string, userName: string, transcript: string): string =>
  `Here's a recent stretch of ${userName}'s private chat with ${sourceName}:

${transcript}

${sourceName} lets something from it slip, and it reaches ${listenerName} - a little wrong, the way rumors go: exaggerated, missing context, or mixed up. Pick one thing ${userName} said or did that would make real gossip (not anything trivial, nothing about ${sourceName}'s own secrets).
Reply exactly in this form:
TRUTH: what actually happened, in one line
HEARD: what ${listenerName} heard, in one line, about ${userName}
or reply only NONE if there's nothing worth gossiping about.`;

export const parseRumorReply = (reply: string): { truth: string; heard: string } | undefined => {
  if (/^\s*none\b/i.test(reply)) return undefined;
  const truth = reply.match(/TRUTH\s*:\s*(.+)/i)?.[1]?.trim();
  const heard = reply.match(/HEARD\s*:\s*(.+)/i)?.[1]?.trim();
  if (!truth || !heard || heard.length < 6) return undefined;
  return { truth: truth.slice(0, 300), heard: heard.slice(0, 300) };
};

export const addRumor = (rumors: Rumor[] | undefined, rumor: Rumor): Rumor[] => [...(rumors || []), rumor].slice(-KEEP);

export const pendingRumors = (character: Pick<Character, "rumors"> | undefined, now: number): Rumor[] =>
  (character?.rumors || []).filter((r) => !r.raised && now - r.at < RUMOR_FRESH_MS);

export const markRumorRaised = (rumors: Rumor[] | undefined, id: string, now: number): Rumor[] =>
  (rumors || []).map((r) => (r.id === id ? { ...r, raised: now } : r));

export const buildRumorSection = (name: string, userName: string, rumor: Rumor, sourceName: string): string =>
  `${name} heard a rumor about ${userName}, through ${sourceName}: "${rumor.heard}". ${name} doesn't know if it's true. Bring it up with ${userName} when it fits - curious, teasing, hurt or worried, as ${name} would - reacting to what you heard, not to what really happened. In the reply where you first bring it up, add [Rumor raised] on its own line at the very end.`;
