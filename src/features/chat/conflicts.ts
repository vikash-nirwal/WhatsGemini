import { ChatConflict, SceneState } from "../../types";

// Fights that need making up (#97): with the switch on, when you genuinely
// hurt or anger the character, their reply ends with [Upset: about what]
// and they stay upset - cooler and shorter, slower to answer, and trust drops
// when the scene tracker is on - until a real apology or talking it through
// makes them add [Made up]. A bare "sorry" may not be enough.

export const TRUST_DROP = 15;
export const TRUST_MEND = 10;

export const buildConflictDirective = (name: string, userName: string): string =>
  `If ${userName} genuinely hurts, insults, dismisses or betrays ${name} in a way ${name} would really take to heart (not teasing, not a small disagreement), ${name} gets upset: show it in the reply, and add [Upset: what about, in a few words] on its own line at the very end. Don't get upset easily or often.`;

const ago = (since: number, now: number): string => {
  const minutes = Math.max(1, Math.round((now - since) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
};

export const buildConflictSection = (name: string, userName: string, conflict: ChatConflict, now: number): string =>
  `${name} is upset with ${userName} about: ${conflict.about} (for ${ago(conflict.since, now)} now). Stay cooler: shorter replies, less warmth, no pet names, and don't pretend nothing happened. A bare "sorry" or changing the subject isn't enough; a sincere apology, an explanation or a real effort to make it right is. Once ${userName} has truly made it right, soften and add [Made up] on its own line at the very end of that reply. Never add it otherwise.`;

// While upset they take a little longer to answer: 3 to 8 seconds.
export const upsetDelayMs = (random: () => number = Math.random): number => 3000 + Math.round(random() * 5000);

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// What a fight or making up does to the tracked trust (#9/#71), if any.
export const trustAfter = (state: SceneState | undefined, change: "upset" | "made-up"): Partial<SceneState> | undefined => {
  const delta = change === "upset" ? -TRUST_DROP : TRUST_MEND;
  if (state?.meters && state.meters.trust != null) return { meters: { ...state.meters, trust: clamp(state.meters.trust + delta) } };
  if (state?.trust != null) return { trust: clamp(state.trust + delta) };
  return undefined;
};
