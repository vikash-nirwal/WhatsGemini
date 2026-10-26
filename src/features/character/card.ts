import { Character } from "../../types";

// The card (#143, #158): what a character *is*, as written in the editor -
// look, personality, voice, prompt and the switches for what they do. A
// copy for another world starts from it, then is its own character; anything
// not listed here (memory, statuses, day logs, letters, gifts, moods,
// diary...) is what built up in one world, and Reset clears it.
export const CARD_FIELDS = [
  "name", "description", "prompt", "scenario", "first_mes", "mes_example", "alternateGreetings", "postHistoryInstructions", "creatorNotes",
  "appearance", "visualTags", "localImageSettings", "appearanceImages", "artStyle", "avatar", "gallery", "accent",
  "tags", "contentRating", "adultsConfirmed", "personalityTraits", "modelOverride", "voice", "writingStyle", "home",
  "intimacy", "secrets", "importantDates", "schedule", "wardrobe", "stickers", "emotionPortraits", "loreEntries",
  "innerThoughts", "writesLetters", "textsFirst", "firstTextLimit", "dreams", "badDays", "dayLogs", "textingSlips",
  "preoccupations", "spreadsRumors", "postsStatuses", "statusPhotos", "viewOncePhotos", "profileChanges",
  "leavesOnRead", "misremembers", "autoSelfie", "diaryEnabled",
] as const satisfies readonly (keyof Character)[];

type Card = Pick<Character, (typeof CARD_FIELDS)[number]>;

export const cardOf = (c: Character): Card => {
  const card: Record<string, unknown> = {};
  for (const key of CARD_FIELDS) if (c[key] !== undefined) card[key] = c[key];
  return card as Card;
};

// The relationship they started with: the first one on record, or today's
// when it never changed.
export const startingRelationship = (c: Character) => c.relationshipHistory?.[0]?.from ?? c.relationship;

// The id every copy of a character shares: the original's.
export const rootOf = (c: Character) => c.cardOf ?? c.id;

// A new copy for another world: the card and the starting relationship,
// nothing that happened elsewhere.
export const worldCopy = (c: Character, worldId: number | null): Omit<Character, "id"> => ({
  ...cardOf(c),
  relationship: startingRelationship(c),
  ...(worldId ? { worldId } : {}),
  cardOf: rootOf(c),
});

// Reset (#158): the card as it is, in the same world, everything else gone.
export const resetCharacter = (c: Character): Character => ({
  ...cardOf(c),
  id: c.id,
  relationship: startingRelationship(c),
  ...(c.worldId ? { worldId: c.worldId } : {}),
  ...(c.cardOf ? { cardOf: c.cardOf } : {}),
});
