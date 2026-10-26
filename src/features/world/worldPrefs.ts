// Per-world switches (#145, #146), My world included (it isn't a stored
// World, so these live in localStorage rather than on the World record).
export interface WorldPrefs {
  peek?: boolean; // show their own talk, read-only (#145); hidden by default
  talkLength?: number; // most messages in one exchange (#145)
  keepLiving?: boolean; // background life while you're in another world (#146); on unless false
  // Living-world features, each off until you switch it on (the user's
  // call, 2026-10-26): they add background calls and change the story.
  events?: boolean; // world events (#162)
  drift?: boolean; // relationships that drift from their talk (#163)
  arrivals?: boolean; // newcomers and life events (#164)
  places?: boolean; // who's where on the map (#165)
  reputation?: boolean; // how people there see you (#166)
  introductions?: boolean; // people introduce you to people they know (#167)
  secrets?: boolean; // secrets between characters (#170)
}

export type WorldFeature = "events" | "drift" | "arrivals" | "places" | "reputation" | "introductions" | "secrets";

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

// A living world in one tap (#182): every living-world feature but secrets,
// which add drama some worlds don't want.
export const LIVING_WORLD: WorldFeature[] = ["events", "drift", "arrivals", "places", "reputation", "introductions"];
export const isLivingWorld = (prefs: WorldPrefs) => LIVING_WORLD.every((f) => prefs[f]);
export const livingWorldPatch = (on: boolean): WorldPrefs => Object.fromEntries(LIVING_WORLD.map((f) => [f, on]));

export const featureOn = (worldId: number | null | undefined, feature: WorldFeature) => Boolean(loadWorldPrefs(worldId ?? null)[feature]);

export const talkLengthFor = (worldId: number | null) =>
  Math.min(MAX_TALK_LENGTH, Math.max(2, loadWorldPrefs(worldId).talkLength || DEFAULT_TALK_LENGTH));

// Whether a world's background life runs (#146): the one on screen always
// does; others unless their "keep living" switch is off.
export const livingIn = (worldId: number | null, currentWorldId: number | null) =>
  worldId === currentWorldId || loadWorldPrefs(worldId).keepLiving !== false;
