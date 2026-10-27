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

// While a day is being simulated (#191), waits are a fraction of themselves,
// so what would come due over the day comes due now.
let boost = 1;
export const withLifeBoost = async <T,>(factor: number, run: () => Promise<T>): Promise<T> => {
  boost = factor;
  try {
    return await run();
  } finally {
    boost = 1;
  }
};

// A background job's waiting time at the current setting.
export const lifeScaled = (ms: number, level: LifeLevel = loadLifeDial()): number => (ms * FACTOR[level]) / boost;

// Roughly how many background calls a day the setting makes, for its hint.
export const LIFE_HINT: Record<LifeLevel, string> = {
  quiet: "About half as much happens while you're away.",
  normal: "Characters text, post and write at their usual pace.",
  lively: "About twice as much: more texts, statuses and letters, and more calls on your key.",
};

// Restoring a backup (#215): takes the saved level only if it's one we know,
// so an odd value in a file can't leave the dial in a state it can't show.
export const restoreLifeDial = (raw: unknown): void => {
  if (typeof raw === "string" && (LIFE_LEVELS as string[]).includes(raw)) saveLifeDial(raw as LifeLevel);
};
