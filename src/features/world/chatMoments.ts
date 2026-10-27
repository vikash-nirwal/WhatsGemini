import { Character, Chat, World } from "../../types";
import { worldOf } from "./currentWorld";
import { logToTimeline } from "./timeline";

// Big moments in a private chat go on the world's timeline (#161, #230). The
// world used to hear only of god mode and time passing, so when you and
// Aria started dating, broke up or blocked each other, nobody else could
// know - not even as hearsay (#206). Each one is private: the character
// knows it first-hand, and it travels from there like anything else.
// A what-if, a chat that keeps its own memory, or disappearing messages
// stay out: none of those is the world's story.
export const chatMomentInScope = (chat: Pick<Chat, "whatIf" | "memoryScope" | "disappearing" | "characterIds"> | undefined) =>
  Boolean(chat && !chat.whatIf && chat.memoryScope !== "chat" && !chat.disappearing && (chat.characterIds?.length || 0) === 1);

export const logChatMoment = (chat: (Pick<Chat, "worldId" | "whatIf" | "memoryScope" | "disappearing" | "characterIds">) | undefined, character: Pick<Character, "id"> | undefined, text: string) =>
  (_dispatch: unknown, getState: () => { world?: { worlds: World[] } }) => {
    if (!chat || !character || !chatMomentInScope(chat)) return;
    const worlds = getState().world?.worlds || [];
    const worldId = worldOf(chat, worlds);
    const world = worlds.find((w) => w.id === worldId);
    void logToTimeline(worldId, { kind: "you", text, characterIds: [character.id], audience: "private" }, world?.storyTime);
  };
