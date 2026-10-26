import { Character, Chat, World } from "../../types";
import { dbService } from "../../services/dbService";

// Undo a world-wide time skip (#189). A three-year skip rewrites a lot at
// once - notices in every chat, life events, ties, the calendar, chapters,
// first texts - so the last one per world can be taken back. It can only be
// undone while nothing new has happened since: a message after the skip
// means the story has moved on from it.

export interface TimeSkipSnapshot {
  at: number;
  endAt?: number;
  gap: string;
  worldId: number | null;
  chats: Chat[]; // as they were, whole
  characters: Pick<Character, "id" | "lifeEvents" | "ties" | "knowsAbout" | "firstTexts">[];
  world?: Pick<World, "storyTime" | "arc">;
}

const keyOf = (worldId: number | null) => `world_time_undo_${worldId ?? "mine"}`;
export const UNDO_FOR_MS = 24 * 60 * 60 * 1000;

export const saveSnapshot = (s: TimeSkipSnapshot) => dbService.setSetting(keyOf(s.worldId), s);
export const loadSnapshot = async (worldId: number | null): Promise<TimeSkipSnapshot | undefined> =>
  (await dbService.getSetting(keyOf(worldId))) as TimeSkipSnapshot | undefined;
export const clearSnapshot = (worldId: number | null) => dbService.setSetting(keyOf(worldId), undefined);

export const snapshotOf = (worldId: number | null, gap: string, at: number, chats: Chat[], characters: Character[], world?: World): TimeSkipSnapshot => ({
  at,
  gap,
  worldId,
  chats: JSON.parse(JSON.stringify(chats.filter((c) => c.id && !c.archived))),
  characters: characters.map((c) => ({ id: c.id, lifeEvents: c.lifeEvents, ties: c.ties, knowsAbout: c.knowsAbout, firstTexts: c.firstTexts })),
  ...(world ? { world: { storyTime: world.storyTime, arc: world.arc } } : {}),
});

// Whether it can still be undone: recent, finished, and nothing said since.
export const canUndo = (s: TimeSkipSnapshot | undefined, chats: Chat[], now: number): boolean => {
  if (!s?.endAt || now - s.at > UNDO_FOR_MS) return false;
  return s.chats.every((before) => {
    const after = chats.find((c) => c.id === before.id);
    return !after || (after.content || []).every((m) => (m.timestamp || 0) <= s.endAt!);
  });
};
