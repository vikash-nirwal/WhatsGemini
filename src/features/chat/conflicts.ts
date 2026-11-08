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

// Fights in a group (#250). A fight is between you and one member, never
// between two members: the [Upset:] and [Made up] tags already come from the
// one replying and are about you, so the member who's hurt is simply the one
// who wrote the tag, and making up stays between you and them. Fights between
// members would need a second party in every tag and their own way to end,
// for little gain over the room's relationships (#24). One fight runs at a
// time, as in a 1:1 chat. The others only sense the tension.
export const buildTensionNote = (upsetName: string, userName: string, about: string): string =>
  `${upsetName} is upset with ${userName} right now (about: ${about}). You may notice the tension, in a line at most; it's their fight, not yours.`;

// The fight note for one member's prompt: theirs to carry if they're the one
// upset, a short line about the tension if someone else is, or how one starts
// when there's none. Undefined when fights are off or the fight's member has
// left the group.
export const groupConflictNoteFor = (
  chat: { conflicts?: boolean; conflict?: ChatConflict } | undefined,
  speaker: { id?: number; name: string },
  members: { id?: number; name: string }[],
  userName: string,
  now: number
): string | undefined => {
  if (!chat?.conflicts) return undefined;
  const fight = chat.conflict;
  if (!fight) return buildConflictDirective(speaker.name, userName);
  if (fight.withId === speaker.id) return buildConflictSection(speaker.name, userName, fight, now);
  const upset = members.find((m) => m.id === fight.withId);
  return upset ? buildTensionNote(upset.name, userName, fight.about) : undefined;
};

// What a reply's [Upset:] or [Made up] tag changes: a fight starts only when
// fights are on and none is running, and only the one upset can end it - in a
// group (#250) that's the member it's with, so another member's [Made up]
// does nothing.
export const fightChange = (
  chat: { conflicts?: boolean; conflict?: ChatConflict } | undefined,
  tags: { upset?: string; madeUp?: boolean } | undefined,
  room: boolean,
  speakerId: number | undefined
): { upset: boolean; madeUp: boolean } => ({
  upset: Boolean(tags?.upset && chat?.conflicts && !chat.conflict && (!room || speakerId !== undefined)),
  madeUp: Boolean(tags?.madeUp && chat?.conflict && (!room || chat.conflict.withId === speakerId)),
});
