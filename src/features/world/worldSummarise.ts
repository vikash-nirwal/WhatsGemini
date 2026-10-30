import { Adventure, Character, Chat, Message, World } from "../../types";
import { foldSplit, MAX_CHUNK_TOKENS } from "../ai/utils/compressionSplit";
import { countSeedMessages, latestSummaryIndex } from "../ai/utils/transcript";
import { estimateTokens } from "../ai/utils/tokenEstimator";
import { condenseDue } from "../memory/condense";

// "Summarise this world" (the user's ask, 2026-10-30): every chat and
// adventure in a world that's past its history limit is summarised now,
// and every resident whose memory is past its cap is condensed, instead of
// one at a time as you next send there. The same rules as on send
// (foldSplit), so it never folds what a send wouldn't.

export interface SummariseItem {
  kind: "chat" | "adventure" | "memory";
  id: number;
  name: string;
  tokens?: number; // about how much would be read to summarise it
  passes?: number; // summary calls it takes, MAX_CHUNK_TOKENS at a time
}

// What's waiting to be folded in one message list, all of it (not one pass).
export const pendingFold = (messages: Message[], thresholdMessages: number, keepTokens: number): { tokens: number; passes: number } | undefined => {
  const latest = latestSummaryIndex(messages);
  const compressible = messages.slice(latest >= 0 ? latest : countSeedMessages(messages));
  const split = foldSplit(compressible, thresholdMessages, keepTokens, (m) => estimateTokens(m.txt), Infinity);
  if (!split) return undefined;
  const tokens = compressible.slice(0, split).reduce((sum, m) => sum + estimateTokens(m.txt), 0);
  return { tokens, passes: Math.max(1, Math.ceil(tokens / MAX_CHUNK_TOKENS)) };
};

// A chat is in the world when it's set there, or everyone in it lives there.
export const chatInWorld = (chat: Chat, worldId: number, characters: Character[]): boolean =>
  chat.worldId === worldId ||
  (chat.worldId == null && (chat.characterIds || []).length > 0 && (chat.characterIds || []).every((id) => characters.find((c) => c.id === id)?.worldId === worldId));

export const scanWorld = (
  world: Pick<World, "id">,
  { chats, adventures, characters }: { chats: Chat[]; adventures: Adventure[]; characters: Character[] },
  { thresholdMessages, keepTokens }: { thresholdMessages: number; keepTokens: number }
): SummariseItem[] => {
  const nameOf = (chat: Chat) => chat.title || (chat.characterIds || []).map((id) => characters.find((c) => c.id === id)?.name).filter(Boolean).join(", ") || "A chat";
  const chatItems = chats.filter((c) => chatInWorld(c, world.id, characters)).flatMap((c): SummariseItem[] => {
    const due = pendingFold(c.content || [], thresholdMessages, keepTokens);
    return due ? [{ kind: "chat", id: c.id, name: nameOf(c), ...due }] : [];
  });
  const adventureItems = adventures.filter((a) => a.worldId === world.id).flatMap((a): SummariseItem[] => {
    const due = pendingFold(a.content || [], thresholdMessages, keepTokens);
    return due ? [{ kind: "adventure", id: a.id, name: a.title || "An adventure", ...due }] : [];
  });
  const memoryItems = characters.filter((c) => c.worldId === world.id && condenseDue(c)).map((c): SummariseItem => ({ kind: "memory", id: c.id, name: c.name }));
  return [...chatItems, ...adventureItems, ...memoryItems];
};
