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
  goals?: boolean; // what each wants this week (#208)
  extras?: boolean; // people around who aren't characters (#218)
  worldTurn?: boolean; // one call per world turn for talk, events and lives, and a catch-up story (#212, #213)
  callCap?: number; // background calls a day at most (#192); unset = no limit
  quietHours?: [number, number]; // hours when nothing runs in the background (#192), e.g. [23, 8]
}

export type WorldFeature = "events" | "drift" | "arrivals" | "places" | "reputation" | "introductions" | "secrets" | "goals" | "worldTurn" | "extras";

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

// Spending limit and quiet hours (#192): whether a background call for this
// world may run now, and counting the ones that do (per day, on this device).
const today = (now: number) => new Date(now).toISOString().slice(0, 10);
const countKey = (worldId: number | null, now: number) => `world_calls_${worldId ?? "mine"}_${today(now)}`;

export const inQuietHours = (quiet: [number, number] | undefined, now: number) => {
  if (!quiet) return false;
  const h = new Date(now).getHours();
  const [from, to] = quiet;
  return from <= to ? h >= from && h < to : h >= from || h < to;
};

export const callsToday = (worldId: number | null, now: number) => {
  try {
    return Number(localStorage.getItem(countKey(worldId, now))) || 0;
  } catch {
    return 0;
  }
};

export const backgroundAllowed = (worldId: number | null, now: number) => {
  const prefs = loadWorldPrefs(worldId);
  return !inQuietHours(prefs.quietHours, now) && (!prefs.callCap || callsToday(worldId, now) < prefs.callCap);
};

export const countBackgroundCall = (worldId: number | null, now: number) => {
  try {
    localStorage.setItem(countKey(worldId, now), String(callsToday(worldId, now) + 1));
  } catch {
    // Storage can be refused; the limit just can't count then.
  }
};

export const featureOn = (worldId: number | null | undefined, feature: WorldFeature) => Boolean(loadWorldPrefs(worldId ?? null)[feature]);

export const talkLengthFor = (worldId: number | null) =>
  Math.min(MAX_TALK_LENGTH, Math.max(2, loadWorldPrefs(worldId).talkLength || DEFAULT_TALK_LENGTH));

// Whether a world's background life runs (#146): the one on screen always
// does; others unless their "keep living" switch is off.
export const livingIn = (worldId: number | null, currentWorldId: number | null) =>
  worldId === currentWorldId || loadWorldPrefs(worldId).keepLiving !== false;

// Every world's prefs at once, for the full backup (#215), keyed as stored:
// a world's id, or "mine".
export const allWorldPrefs = (): Record<string, WorldPrefs> => loadAll();

// Writes every world's prefs at once, for restoring a backup (#215). The
// caller has already decided what to keep from this device and what to take
// from the backup, so this replaces the whole set.
export const replaceAllWorldPrefs = (all: Record<string, WorldPrefs>): void => {
  try {
    localStorage.setItem(LS_WORLD_PREFS, JSON.stringify(all));
  } catch {
    // Storage can be refused; the restore still brings back everything else.
  }
  window.dispatchEvent(new Event("world-prefs"));
};

// What of a world's prefs goes with it to another person (#215): the switches
// and talk choices that make the world what it is. Keep living, the call cap
// and quiet hours stay behind: they're about how much this device spends and
// when its owner sleeps, which the person you share with should choose for
// themself. Only values that differ from the defaults are kept, so a share
// link grows by a few bytes at most. Import runs it too, so a file written by
// hand can't slip anything else in.
const TRAVELLING_SWITCHES: (WorldFeature | "peek")[] = ["events", "drift", "arrivals", "places", "reputation", "introductions", "secrets", "goals", "worldTurn", "extras", "peek"];
export const travellingPrefs = (prefs: WorldPrefs | undefined): WorldPrefs => {
  const out: WorldPrefs = {};
  if (!prefs || typeof prefs !== "object") return out;
  for (const k of TRAVELLING_SWITCHES) if (prefs[k] === true) out[k] = true;
  const length = prefs.talkLength;
  if (typeof length === "number" && Number.isFinite(length) && length !== DEFAULT_TALK_LENGTH) {
    out.talkLength = Math.min(MAX_TALK_LENGTH, Math.max(2, Math.round(length)));
  }
  return out;
};
