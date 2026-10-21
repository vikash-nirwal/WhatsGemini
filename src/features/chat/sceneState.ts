import { SceneState } from "../../types";

// Scene state HUD (#9): with the tracker on, each reply ends with a hidden
// <state> block (where they are, the time of day, what the character is
// wearing, and two 0-100 meters for affection and trust). It's parsed off
// like the emotion tag, kept on the chat, shown as a strip under the header
// and fed back every turn, so the details stay consistent.

export const METERS = ["affection", "trust"] as const;
type Meter = (typeof METERS)[number];

export const buildStateDirective = (state: SceneState | undefined, charName: string): string => {
  const current = state && formatState(state);
  return [
    "Keep track of the scene's state and keep it consistent from reply to reply.",
    current ? `The state right now: ${current}. Change only what the story actually changes.` : "",
    `At the very end of every reply, on its own line, add exactly: <state>location: ...; time: ...; outfit: ...; affection: N; trust: N</state>`,
    `"outfit" is what ${charName} is wearing. "affection" and "trust" are how ${charName} feels about the user, 0 to 100, and move only a few points at a time unless something big happens. Keep each value short (a few words). Never mention or explain the block.`,
  ].filter(Boolean).join("\n");
};

export const formatState = (state: SceneState): string =>
  [
    state.location && `location: ${state.location}`,
    state.time && `time: ${state.time}`,
    state.outfit && `outfit: ${state.outfit}`,
    state.affection != null && `affection: ${state.affection}`,
    state.trust != null && `trust: ${state.trust}`,
  ].filter(Boolean).join("; ");

const STATE_BLOCK = /<\s*state\s*>([\s\S]*?)<\s*\/\s*state\s*>/gi;
const STATE_UNCLOSED = /<\s*state\s*>([\s\S]*)$/i;

const clampMeter = (raw: string): number | undefined => {
  const n = Number((raw.match(/-?\d+(\.\d+)?/) || [])[0]);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined;
};

// Reads "key: value; key: value" (newlines or commas between pairs work too).
export const parseState = (inner: string): Partial<SceneState> => {
  const state: Partial<SceneState> = {};
  for (const part of inner.split(/[;\n]|,(?=\s*(?:location|time|outfit|affection|trust)\s*[:=])/i)) {
    const m = part.match(/^\s*(location|place|time|outfit|clothes|affection|trust)\s*[:=]\s*(.+?)\s*$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].replace(/^["']|["']$/g, "").trim();
    if (!value) continue;
    if (key === "affection" || key === "trust") {
      const n = clampMeter(value);
      if (n != null) state[key as Meter] = n;
    } else {
      const field = key === "place" ? "location" : key === "clothes" ? "outfit" : (key as "location" | "time" | "outfit");
      state[field] = value.slice(0, 80);
    }
  }
  return state;
};

export const extractStateBlock = (text: string): { text: string; state?: Partial<SceneState> } => {
  let found: Partial<SceneState> | undefined;
  let rest = text.replace(STATE_BLOCK, (_, inner: string) => {
    found = { ...found, ...parseState(inner) };
    return "";
  });
  const unclosed = rest.match(STATE_UNCLOSED);
  if (unclosed) {
    found = { ...found, ...parseState(unclosed[1]) };
    rest = rest.slice(0, unclosed.index);
  }
  if (rest === text) return { text };
  return { text: rest.replace(/\n{3,}/g, "\n\n").trim(), state: found && Object.keys(found).length > 0 ? found : undefined };
};

// While streaming: hide the block, and one that's still being written.
export const stripStreamingState = (text: string): string =>
  text.replace(STATE_BLOCK, "").replace(STATE_UNCLOSED, "").replace(/<\s*s?t?a?t?e?\s*$/i, "").trimEnd();

export const mergeState = (current: SceneState | undefined, update: Partial<SceneState>): SceneState => ({
  ...current,
  ...update,
  updatedAt: Date.now(),
});
