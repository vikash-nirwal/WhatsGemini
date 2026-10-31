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

// A copy kept from a deleted world whose original lives in the same world
// as it (`here`): one person, so it's listed inside the original's card.
export const isVariant = (c: Character, here: Character[]) =>
  c.variantFrom != null && c.cardOf != null && c.cardOf !== c.id && here.some((o) => o.id === c.cardOf && o.worldId === c.worldId);

// The variants listed inside `c`'s card.
export const variantsOf = (c: Character, here: Character[]) => here.filter((v) => v.cardOf === c.id && isVariant(v, here));

// A new copy for another world: the card and the starting relationship,
// nothing that happened elsewhere.
// What they remember, for a copy that keeps it (the user's choice when
// pulling someone into another world): facts, where things stand, their
// diary, how they've grown, their past and how your bond changed. Their
// life there (statuses, day logs, letters, gifts, moods) stays behind.
export const MEMORY_FIELDS = [
  "memory", "pinnedMemory", "memoryCategories", "memoryDates", "memoryStanding",
  "diary", "growth", "pastEvents", "relationshipHistory",
] as const satisfies readonly (keyof Character)[];

export const worldCopy = (c: Character, worldId: number | null, { memories = false }: { memories?: boolean } = {}): Omit<Character, "id"> => {
  const kept: Record<string, unknown> = {};
  if (memories) for (const key of MEMORY_FIELDS) if (c[key] !== undefined) kept[key] = c[key];
  return {
    ...cardOf(c),
    ...kept,
    // With memories, where your relationship got to; fresh, where it began.
    relationship: memories ? c.relationship : startingRelationship(c),
    ...(worldId ? { worldId } : {}),
    cardOf: rootOf(c),
  };
};

// Reset (#158): the card as it is, in the same world, everything else gone.
export const resetCharacter = (c: Character): Character => ({
  ...cardOf(c),
  id: c.id,
  relationship: startingRelationship(c),
  ...(c.worldId ? { worldId: c.worldId } : {}),
  ...(c.cardOf ? { cardOf: c.cardOf } : {}),
});
