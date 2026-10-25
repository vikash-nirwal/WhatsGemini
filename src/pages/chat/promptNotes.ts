import { Character, Chat } from "../../types";
import { RoomContext } from "../../features/ai/utils/promptComposition";
import { effectiveContentRating } from "../../features/character/contentRating";
import { appearanceLocksFor } from "../../features/ai/utils/appearanceLock";
import { buildRelationshipNotes } from "../../features/ai/utils/roomTurns";
import { buildOffscreenTalkSection } from "../../features/chat/offscreenTalk";
import { buildLetterSection } from "../../features/character/letters";
import { buildKnowsSection, factsAboutUser } from "../../features/character/intimacy";

// Notes the chat page adds to a turn's prompt, worked out from the chat and
// its characters. Plain functions, so they're easy to test and reason about.

// Only notes "fresh" enough still go in: from within the last ten messages.
const freshSince = (chat: Chat | undefined): number => {
  const content = chat?.content || [];
  return content.length > 10 ? content[content.length - 10].timestamp || 0 : 0;
};

// Characters know about each other (#74): a short summary of each other
// relationship this character knows of, from that 1:1 chat and memory.
export const knowsNoteFor = (character: Character | undefined, characters: Character[], chats: Chat[], userName: string, now = Date.now()): string | undefined => {
  if (!character?.knowsAbout?.length) return undefined;
  const others = character.knowsAbout
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => Boolean(c) && c!.id !== character.id)
    .map((other) => {
      const chat = chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === other.id);
      const content = chat?.content || [];
      return {
        name: other.name,
        relationship: other.relationship,
        lastAt: content[content.length - 1]?.timestamp,
        recentCount: content.filter((m) => (m.timestamp || 0) > now - 7 * 86_400_000).length,
        facts: factsAboutUser(other.memory, other.memoryCategories),
      };
    });
  return buildKnowsSection(character.name, userName, others, now);
};

// The latest letter this character wrote you in this chat (#61), while fresh.
export const recentLetterNote = (character: Character | undefined, chat: Chat | undefined, chatId: number | null, userName: string): string | undefined => {
  const letter = [...(character?.letters || [])].reverse().find((l) => l.text && l.chatId === chatId);
  return letter && letter.at >= freshSince(chat) ? buildLetterSection(letter, userName) : undefined;
};

// The latest conversation members had while you were away (#58), while fresh.
export const recentOffscreenTalk = (chat: Chat | undefined, members: Character[]): string | undefined => {
  const talk = chat?.offscreenTalks?.[chat.offscreenTalks.length - 1];
  if (!talk || talk.lines.length === 0 || talk.at < freshSince(chat)) return undefined;
  return buildOffscreenTalkSection(talk, Object.fromEntries(members.map((c) => [c.id, c.name])));
};

// A room turn's context. `speaker` is whoever is about to reply; every
// OTHER room member's name goes in `otherParticipants` (that speaker's own
// "who else is here" context), and `speakerNames` labels every
// participant's lines in history so a reply can tell who said what.
export const roomContextFor = (speaker: Character, members: Character[], chat: Chat | undefined): RoomContext => {
  const others = members.filter((c) => c.id !== speaker.id);
  const namesById = Object.fromEntries(members.map((c) => [c.id, c.name]));
  return {
    speakerNames: namesById,
    otherParticipants: others.map((c) => c.name),
    otherParticipantImages: others
      .filter((c) => c.appearanceImages && c.appearanceImages.length > 0)
      .map((c) => ({ name: c.name, images: c.appearanceImages! })),
    otherLoreEntries: others.flatMap((c) => c.loreEntries || []),
    othersAllowNsfw: others.every((c) => effectiveContentRating(c) === "nsfw"),
    // New groups keep their scene in `scenario`; older ones kept it in the
    // author's note (the new-group dialog's "Scenario" field), so that
    // stands in when there's no scenario.
    groupScenario: chat?.scenario || chat?.authorNote,
    groupMemory: chat?.memory,
    groupPinnedMemory: chat?.pinnedMemory,
    groupStanding: chat?.memoryStanding?.text,
    otherAppearanceLocks: appearanceLocksFor(others),
    relationshipNotes: buildRelationshipNotes(speaker.id, chat?.roomRelationships, namesById),
    thoughts: chat?.innerThoughts,
    offscreenTalk: recentOffscreenTalk(chat, members),
    othersAbout: buildOthersAbout(others),
  };
};

// Who the other members are: a line each, from their description (or the
// start of their prompt) and how they stand with the user.
export const buildOthersAbout = (others: Character[]): string | undefined => {
  const lines = others.map((c) => {
    const about = (c.description || c.prompt || "").replace(/\s+/g, " ").trim();
    const short = about.length > 220 ? `${about.slice(0, 217).trimEnd()}...` : about;
    return `- ${c.name}${short ? `: ${short}` : ""}${c.relationship ? ` (with the user: ${c.relationship})` : ""}`;
  });
  return lines.length > 0 ? `Who else is in this group:\n${lines.join("\n")}` : undefined;
};
