import { Character, Chat } from "../../types";

// Deleting a world (the user's call, 2026-10-31). Its people used to move to
// Default, so every copy of someone from a deleted world sat next to the
// original there, looking like a duplicate. Now its people go with it,
// except those you tick to keep: they move to Default, and one whose
// original is already there becomes a variant shown inside the original's
// card (`isVariant`, character/card.ts); anyone else stays a person of
// their own. Chats go with the people in them; a chat someone kept is still
// in moves to Default.

export interface WorldDeletionPlan {
  remove: number[]; // characters deleted, and with them every chat left empty
  keep: { id: number; patch: Partial<Character> }[];
  chats: { id: number; patch: Partial<Chat> }[];
}

export const planWorldDeletion = (worldId: number, worldName: string, characters: Character[], chats: Chat[], keepIds: Set<number>): WorldDeletionPlan => {
  const residents = characters.filter((c) => c.worldId === worldId);
  const remove = residents.filter((c) => !keepIds.has(c.id)).map((c) => c.id);
  const removed = new Set(remove);
  // An original already in Default makes a kept copy its variant.
  const inDefault = (id: number) => characters.some((o) => o.id === id && !residents.includes(o) && o.worldId == null);
  const keep = residents
    .filter((c) => keepIds.has(c.id))
    .map((c) => ({ id: c.id, patch: { worldId: undefined, ...(c.cardOf != null && inDefault(c.cardOf) ? { variantFrom: worldName } : {}) } as Partial<Character> }));
  const variants = new Set(keep.filter((k) => k.patch.variantFrom).map((k) => k.id));
  const chatPatches = chats.flatMap((chat) => {
    if (chat.worldId !== worldId || chat.id == null) return [];
    const left = (chat.characterIds || []).filter((id) => !removed.has(id));
    if (!left.length) return []; // deleted with its people
    // A variant's own chat says which one it is, beside the original's.
    const variant = (chat.characterIds || []).length === 1 && variants.has(left[0]) ? residents.find((c) => c.id === left[0]) : undefined;
    return [{ id: chat.id, patch: { worldId: undefined, ...(variant ? { title: `${variant.name} (${worldName})` } : {}) } as Partial<Chat> }];
  });
  return { remove, keep, chats: chatPatches };
};
