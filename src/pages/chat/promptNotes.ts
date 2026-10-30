import { Character, Chat } from "../../types";
import { YOU } from "../../utils/constants";
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
        // Only what they know about the user themself: what the user and the
        // other character are to each other stays between them.
        facts: factsAboutUser(other.memory, other.memoryCategories).filter((f) => other.memoryCategories?.[f] !== "relationship"),
      };
    })
    // In a big world everyone may know everyone: the few the user talks to
    // most recently are what matters, and the rest would only cost tokens.
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
    .slice(0, 4);
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

// In a group, what this speaker and the user said in their own 1:1 chat
// lately, so the group doesn't feel like meeting a stranger.
export const ownChatNoteFor = (speaker: Character, chats: Chat[], userName: string, limit = 6): string | undefined => {
  const own = chats
    .filter((c) => c.characterIds?.length === 1 && c.characterIds[0] === speaker.id && !c.whatIf)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
  const lines = (own?.content || [])
    .filter((m) => !m.isSystem && !m.isNarration && m.txt?.trim())
    .slice(-limit)
    .map((m) => `${m.role === YOU ? userName : speaker.name}: ${(m.txt || "").replace(/\s+/g, " ").slice(0, 200)}`);
  return lines.length ? `Your own private chat with ${userName} lately (the others here didn't see it; keep private things private unless you choose to share):\n${lines.join("\n")}` : undefined;
};

// In a private chat, what's been going on lately in groups this character
// shares with the user: a group's facts stayed in that group (Chat.memory),
// so without this they'd forget the bonfire chat by the next 1:1.
const GROUP_FRESH_MS = 3 * 86_400_000;
export const groupChatsNoteFor = (character: Character | undefined, chats: Chat[], characters: Character[], userName: string, currentChatId: number | null, now = Date.now()): string | undefined => {
  if (!character) return undefined;
  const groups = chats
    .filter((c) => c.id !== currentChatId && (c.characterIds?.length || 0) > 1 && c.characterIds!.includes(character.id) && !c.archived && !c.theirs)
    .map((c) => ({ c, at: c.content?.[c.content.length - 1]?.timestamp || 0 }))
    .filter(({ at }) => at && now - at < GROUP_FRESH_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, 2);
  if (!groups.length) return undefined;
  const nameOf = (id?: number) => characters.find((x) => x.id === id)?.name || "someone";
  const parts = groups.map(({ c }) => {
    const standing = c.memoryStanding?.text?.trim();
    // Pinned facts first and kept (#227): they're what the user marked as mattering.
    const pinned = c.pinnedMemory || [];
    const rest = (c.memory || []).filter((f) => !pinned.includes(f));
    const facts = [...pinned, ...rest.slice(rest.length - Math.max(0, 4 - pinned.length))];
    const lines = (c.content || []).filter((m) => !m.isSystem && !m.isRoomEvent && m.txt?.trim()).slice(-4)
      .map((m) => `${m.role === YOU ? userName : nameOf(m.speakerId)}: ${(m.txt || "").replace(/\s+/g, " ").slice(0, 160)}`);
    return [`In the group "${c.title}":`, standing ? standing.slice(0, 400) : facts.length ? `- ${facts.join("\n- ")}` : "", `Last said:\n${lines.join("\n")}`].filter(Boolean).join("\n");
  });
  return `Group chats you're in with ${userName}, lately (you were there; it can come up):\n${parts.join("\n\n")}`;
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
    groupTitle: chat?.title,
    otherAppearanceLocks: appearanceLocksFor(others),
    // How each of the others is tied to this speaker (#74, #144), so a
    // brother and sister don't talk like acquaintances.
    relationshipNotes: buildRelationshipNotes(speaker.id, chat?.roomRelationships, namesById),
    thoughts: chat?.innerThoughts,
    offscreenTalk: recentOffscreenTalk(chat, members),
    othersAbout: buildOthersAbout(others, speaker),
  };
};

// Who the other members are: a line each, from their description (or the
// start of their prompt) and how they stand with the user.
export const buildOthersAbout = (others: Character[], speaker?: Character): string | undefined => {
  const lines = others.map((c) => {
    const about = (c.description || c.prompt || "").replace(/\s+/g, " ").trim();
    const short = about.length > 220 ? `${about.slice(0, 217).trimEnd()}...` : about;
    const tie = speaker?.ties?.find((t) => t.withId === c.id)?.tie.replace(/^your\s+/i, "");
    return `- ${c.name}${tie ? ` [your ${tie}]` : ""}${short ? `: ${short}` : ""}${c.relationship ? ` (with the user: ${c.relationship})` : ""}`;
  });
  return lines.length > 0 ? `Who else is in this group:\n${lines.join("\n")}` : undefined;
};
