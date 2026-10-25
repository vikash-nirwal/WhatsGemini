import { World } from "../../types";

// Worlds as spaces (#143): the app shows one world at a time, like switching
// accounts. Everything that existed before worlds lives in "My world", which
// isn't a stored World: it's whatever has no worldId.
export const MY_WORLD = "My world";

const LS_CURRENT_WORLD = "current_world";

export const loadCurrentWorld = (): number | null => {
  try {
    const raw = localStorage.getItem(LS_CURRENT_WORLD);
    const id = raw ? Number(raw) : NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

export const saveCurrentWorld = (id: number | null) => {
  try {
    if (id) localStorage.setItem(LS_CURRENT_WORLD, String(id));
    else localStorage.removeItem(LS_CURRENT_WORLD);
  } catch {
    // Private windows can refuse storage; the switch still holds for this visit.
  }
};

// The world a chat or character belongs to. An id whose world was deleted
// counts as My world, so deleting a world never hides its people or chats.
export const worldOf = (item: { worldId?: number }, worlds: World[]): number | null =>
  item.worldId && worlds.some((w) => w.id === item.worldId) ? item.worldId : null;

export const inWorld = (worldId: number | null, worlds: World[]) => (item: { worldId?: number }) => worldOf(item, worlds) === worldId;

export const worldName = (worldId: number | null, worlds: World[]) => worlds.find((w) => w.id === worldId)?.name || MY_WORLD;
