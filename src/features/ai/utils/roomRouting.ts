import { Character, Message } from "../../../types";
import { AI } from "../../../utils/constants";

// Characters allowed to speak right now - every room member minus anyone
// muted (Chat.mutedParticipantIds). A 1:1 chat's sole character is always
// "active" since it's never in its own mute list through any UI path.
export const getActiveParticipants = (participants: Character[], mutedIds?: number[]): Character[] =>
  mutedIds && mutedIds.length > 0 ? participants.filter((c) => !mutedIds.includes(c.id)) : participants;

// Picks who replies next when the user didn't @mention anyone and nobody
// manually forced a specific bot: the active participant right after
// whoever spoke last (by Message.speakerId), wrapping around - a plain
// round-robin so every bot gets a turn instead of one dominating. Falls
// back to the first active participant if no prior speaker is found (a
// fresh room, or the room's history predates speakerId).
export const resolveNextSpeaker = (participants: Character[], content: Message[], mutedIds?: number[]): Character | undefined => {
  const active = getActiveParticipants(participants, mutedIds);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];

  for (let i = content.length - 1; i >= 0; i--) {
    const msg = content[i];
    if (msg.role === AI && msg.speakerId != null) {
      const lastIndex = active.findIndex((c) => c.id === msg.speakerId);
      if (lastIndex !== -1) return active[(lastIndex + 1) % active.length];
      break; // last speaker isn't an active participant anymore (muted/removed) - fall through to the default
    }
  }
  return active[0];
};

// Looks for a leading "@Name" in the user's message targeting one specific
// active participant (case-insensitive, matches the character's name with
// internal whitespace stripped so "@ElvenMage" matches "Elven Mage") -
// lets the user pick who answers instead of the round-robin default.
// Deliberately simple: only the first @mention counts, and only as a
// whole-name match, not a fuzzy/partial one.
export const parseMention = (text: string, participants: Character[], mutedIds?: number[]): Character | undefined => {
  const match = text.match(/@([^\s@][^\n]*)/);
  if (!match) return undefined;
  const mentioned = match[1].toLowerCase();

  const active = getActiveParticipants(participants, mutedIds);
  // Longest name first, so "@Aria Prime" prefers a character literally
  // named "Aria Prime" over one named "Aria" when both are in the room.
  const sorted = [...active].sort((a, b) => b.name.length - a.name.length);
  for (const character of sorted) {
    const normalizedName = character.name.replace(/\s+/g, "").toLowerCase();
    if (mentioned.replace(/\s+/g, "").startsWith(normalizedName)) return character;
  }
  return undefined;
};

// Defensive strip for a leading "Name: " the model added to its own reply
// despite being told not to - telling it every history line is
// speaker-prefixed (so it can tell who said what) apparently invites some
// models to imitate that format in their own output too. Mirrors how this
// app already strips other leaked formatting (e.g. stripImageContextTag) -
// a prompt instruction alone isn't reliable enough to skip the safety net.
export const stripSpeakerPrefix = (text: string, speakerName: string): string => {
  if (!text || !speakerName) return text;
  const escapedName = speakerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`^\\s*${escapedName}\\s*:\\s*`, "i"), "");
};
