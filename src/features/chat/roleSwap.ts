import { Character, UserProfile } from "../../types";

// Role reversal (#105): for a scene, you write as the character and the AI
// plays you, from your persona. The reply is built as if your persona were
// the character and the character were "the user", so every prompt part
// (names, look, voice) follows. Narration lines mark the switch both ways,
// and messages written while swapped say who's playing whom.

// Your persona as the character the AI plays.
export const personaAsCharacter = (persona: UserProfile | undefined, character: Character): Character => ({
  id: character.id, // replies are still stored as this chat's character's turns
  name: persona?.name?.trim() || "User",
  description: persona?.bio || "",
  prompt: [persona?.bio, persona?.backstory].filter(Boolean).join("\n\n"),
  appearance: persona?.appearance,
  appearanceImages: persona?.appearanceImages,
  intimacy: persona?.intimacy,
  artStyle: character.artStyle,
  contentRating: character.contentRating,
  adultsConfirmed: character.adultsConfirmed,
  modelOverride: character.modelOverride,
});

// The character as "the user" the AI is talking to.
export const characterAsPersona = (character: Character): UserProfile => ({
  id: `swap-${character.id}`,
  name: character.name,
  bio: [character.description, character.prompt].filter(Boolean).join(" ").slice(0, 1200),
  appearance: character.appearance,
  appearanceImages: character.appearanceImages,
  intimacy: character.intimacy,
});

export const buildSwapDirective = (characterName: string, userName: string, bodySwap?: boolean): string =>
  `Role reversal: for this scene you play ${userName}, and the person writing to you is playing ${characterName}. Earlier in the history, before the line marking the swap, the user's turns were ${userName} and yours were ${characterName}; from that line on it's the other way round. Write only as ${userName}, in ${userName}'s voice and manner, and never write ${characterName}'s words or actions.${bodySwap ? ` In the story itself, ${userName} and ${characterName} have woken up in each other's bodies: play the confusion and the comedy of it.` : ""}`;

export const swapStartLine = (characterName: string, userName: string, bodySwap?: boolean): string =>
  bodySwap
    ? `${userName} and ${characterName} wake up in each other's bodies. (You're playing ${characterName} now; ${characterName}'s side plays ${userName}.)`
    : `Roles swapped: you're writing as ${characterName}, and ${characterName}'s side plays ${userName}.`;

export const swapEndLine = (characterName: string, userName: string, bodySwap?: boolean): string =>
  bodySwap ? `${userName} and ${characterName} are back in their own bodies.` : `Roles back: you're ${userName} again, and ${characterName} is ${characterName}.`;
