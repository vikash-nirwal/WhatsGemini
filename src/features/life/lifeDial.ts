// The life dial (#131): one setting for how much happens in the background
// - texts first, statuses, letters, channel posts, profile changes, talk
// between characters, rumors, dreams, day logs, preoccupations. It scales
// each job's waiting time: Quiet doubles it (about half as much happens),
// Lively halves it. Kept on this device, like the reading settings.

export type LifeLevel = "quiet" | "normal" | "lively";
export const LS_LIFE_DIAL = "life_dial";
export const LIFE_LEVELS: LifeLevel[] = ["quiet", "normal", "lively"];
const FACTOR: Record<LifeLevel, number> = { quiet: 2, normal: 1, lively: 0.5 };

export const loadLifeDial = (): LifeLevel => {
  try {
    const raw = localStorage.getItem(LS_LIFE_DIAL) as LifeLevel | null;
    return raw && raw in FACTOR ? raw : "normal";
  } catch {
    return "normal";
  }
};

export const saveLifeDial = (level: LifeLevel): void => {
  try {
    localStorage.setItem(LS_LIFE_DIAL, level);
  } catch {
    // Only a convenience.
  }
};

// A background job's waiting time at the current setting.
export const lifeScaled = (ms: number, level: LifeLevel = loadLifeDial()): number => ms * FACTOR[level];

// Roughly how many background calls a day the setting makes, for its hint.
export const LIFE_HINT: Record<LifeLevel, string> = {
  quiet: "About half as much happens while you're away.",
  normal: "Characters text, post and write at their usual pace.",
  lively: "About twice as much: more texts, statuses and letters, and more calls on your key.",
};
