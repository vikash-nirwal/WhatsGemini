import { Character, Chat, Message } from "../../types";

// Fork into a new chat (#86): a new chat that starts where the chosen message
// is, for a "what if" without filling the original with branches. It keeps
// the chat's own setting (world, scenario, notes, limits, modes) and its
// own memory: a fork of a 1:1 chat that shares the character's memory gets
// a copy of it instead (memoryScope "chat"), so the what-if never writes
// back into the character's main story.

// Settings a fork carries over; per-story progress (suggestions waiting,
// games, recaps, last checks) starts fresh.
const CARRIED: (keyof Chat)[] = [
  "authorNote", "worldTags", "hardLimits", "intensity", "scenario", "worldId", "backdrop", "textingMode",
  "replySuggestions", "sceneTracker", "sceneState", "storyScript", "turnMode", "narrator", "roomRelationships",
  "innerThoughts", "language", "coWriting", "stage", "meters", "boldness", "mutedParticipantIds", "personaId",
];

export const buildFork = (chat: Chat, upToMessageId: string, character: Character | undefined): Omit<Chat, "id"> | undefined => {
  const at = (chat.content || []).findIndex((m) => m.id === upToMessageId);
  if (at < 0) return undefined;
  // Fresh copies, so nothing in the fork shares an object with the original.
  const content: Message[] = JSON.parse(JSON.stringify(chat.content.slice(0, at + 1)));
  const settings = Object.fromEntries(CARRIED.filter((k) => chat[k] !== undefined).map((k) => [k, chat[k]])) as Partial<Chat>;
  const isRoom = (chat.characterIds || []).length > 1;
  const sharesCharacterMemory = !isRoom && chat.memoryScope !== "chat";
  return {
    ...settings,
    title: `${chat.title} (what if)`,
    timestamp: Date.now(),
    characterIds: [...(chat.characterIds || [])],
    content,
    memoryScope: isRoom ? chat.memoryScope : "chat",
    memory: sharesCharacterMemory ? [...(character?.memory || [])] : chat.memory ? [...chat.memory] : undefined,
    pinnedMemory: sharesCharacterMemory ? [...(character?.pinnedMemory || [])] : chat.pinnedMemory ? [...chat.pinnedMemory] : undefined,
    memoryCategories: sharesCharacterMemory ? character?.memoryCategories : chat.memoryCategories,
  } as Omit<Chat, "id">;
};
