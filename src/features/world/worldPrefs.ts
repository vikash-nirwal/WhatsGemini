// Per-world switches (#145, #146), My world included (it isn't a stored
// World, so these live in localStorage rather than on the World record).
export interface WorldPrefs {
  peek?: boolean; // show their own talk, read-only (#145); hidden by default
  talkLength?: number; // most messages in one exchange (#145)
  keepLiving?: boolean; // background life while you're in another world (#146); on unless false
}

export const DEFAULT_TALK_LENGTH = 10;
export const MAX_TALK_LENGTH = 20;
const LS_WORLD_PREFS = "world_prefs";

const keyOf = (worldId: number | null) => (worldId ? String(worldId) : "mine");

const loadAll = (): Record<string, WorldPrefs> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_WORLD_PREFS) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const loadWorldPrefs = (worldId: number | null): WorldPrefs => loadAll()[keyOf(worldId)] || {};

export const saveWorldPrefs = (worldId: number | null, patch: WorldPrefs): WorldPrefs => {
  const all = loadAll();
  const next = { ...all[keyOf(worldId)], ...patch };
  all[keyOf(worldId)] = next;
  try {
    localStorage.setItem(LS_WORLD_PREFS, JSON.stringify(all));
  } catch {
    // Storage can be refused; the choice still holds until the page reloads.
  }
  window.dispatchEvent(new Event("world-prefs"));
  return next;
};

export const talkLengthFor = (worldId: number | null) =>
  Math.min(MAX_TALK_LENGTH, Math.max(2, loadWorldPrefs(worldId).talkLength || DEFAULT_TALK_LENGTH));

// Whether a world's background life runs (#146): the one on screen always
// does; others unless their "keep living" switch is off.
export const livingIn = (worldId: number | null, currentWorldId: number | null) =>
  worldId === currentWorldId || loadWorldPrefs(worldId).keepLiving !== false;
