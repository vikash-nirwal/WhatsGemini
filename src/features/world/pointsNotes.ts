import { Character } from "../../types";
import { bondOf, tieBaseline } from "./bonds";
import { levelWord, movePoints, PointsChange, setPoint, traitsFrom, valuesOf } from "./points";
import { featureOn, loadWorldPrefs } from "./worldPrefs";

// Points (#234) with ties, worlds and names: who they're toward, what a
// reply is told, and what moments with you do to them. See points.ts.

export type Toward = number | "you";

export const pointsOn = (worldId: number | null | undefined) => featureOn(worldId, "points");
export const traitsOf = (worldId: number | null | undefined) => traitsFrom(loadWorldPrefs(worldId ?? null).traits);

const tieTo = (c: Pick<Character, "ties">, otherId: number) => c.ties?.find((t) => t.withId === otherId)?.tie;
const baseOf = (c: Pick<Character, "ties" | "relationship">, toward: Toward) => tieBaseline(toward === "you" ? c.relationship : tieTo(c, toward));
const stored = (c: Pick<Character, "bonds" | "youPoints">, toward: Toward) => (toward === "you" ? c.youPoints : c.bonds?.find((b) => b.withId === toward)?.points);

// Their scores toward you or someone, faded to now.
export const pointsToward = (c: Character, toward: Toward, now: number): Record<string, number> =>
  valuesOf(stored(c, toward), traitsOf(c.worldId), baseOf(c, toward), now);

// The fields to patch for a change; nothing when Points is off here.
const patchFor = (c: Character, toward: Toward, next: ReturnType<typeof movePoints>): Partial<Character> => {
  if (!next) return {};
  if (toward === "you") return { youPoints: next };
  const now = next.at;
  const bond = bondOf(c, toward, now);
  return { bonds: [...(c.bonds || []).filter((b) => b.withId !== toward), { ...bond, points: next }] };
};

export const nudgePoints = (c: Character, toward: Toward, deltas: Record<string, number>, now: number, why?: string): Partial<Character> =>
  pointsOn(c.worldId) ? patchFor(c, toward, movePoints(stored(c, toward), traitsOf(c.worldId), baseOf(c, toward), deltas, now, why)) : {};

// By hand, on Contact info.
export const setPointsTo = (c: Character, toward: Toward, trait: string, value: number, now: number): Partial<Character> =>
  patchFor(c, toward, setPoint(stored(c, toward), traitsOf(c.worldId), baseOf(c, toward), trait, value, now));

// What moments with you do (#230's moments), in steps of the 0-10 scale.
export const YOU_MOMENTS = {
  gift: { affection: 1, trust: 0.5 },
  upset: { affection: -1, trust: -1, rivalry: 1 },
  madeUp: { affection: 1, trust: 0.5, rivalry: -1 },
  blocked: { affection: -2, trust: -2 },
  unblocked: { trust: 1 },
  closer: { affection: 1, attraction: 0.5, trust: 0.5 }, // a warmer label or a stage up
  apart: { affection: -1, attraction: -1 }, // a cooler label or a stage down
  lieCaught: { trust: -2, respect: -1 },
} satisfies Record<string, Record<string, number>>;

// Where points move: the main story, never a what-if, a chat that keeps
// its own memory, or disappearing messages (nothing there is kept).
export const pointsMoveIn = (chat: { whatIf?: unknown; memoryScope?: string; disappearing?: unknown } | undefined) =>
  Boolean(chat && !chat.whatIf && chat.memoryScope !== "chat" && !chat.disappearing);

// A reply's [Points ...] tags, as patches per character: toward the user,
// or toward someone named who's in the chat. Unknown names are dropped.
export const replyPointsPatches = (speaker: Character, changes: PointsChange[], present: Character[], now: number, why: string): Partial<Character> => {
  let c = speaker;
  let patch: Partial<Character> = {};
  for (const ch of changes) {
    const first = (n: string) => n.trim().split(/\s+/)[0].toLowerCase();
    const other = ch.toward ? present.find((p) => p.id !== speaker.id && (p.name.toLowerCase() === ch.toward!.toLowerCase() || first(p.name) === first(ch.toward!))) : undefined;
    if (ch.toward && !other) continue;
    const step = nudgePoints(c, other ? other.id : "you", ch.deltas, now, why);
    patch = { ...patch, ...step };
    c = { ...c, ...step };
  }
  return patch;
};

const line = (name: string, values: Record<string, number>) =>
  `- Toward ${name}: ${Object.entries(values).map(([t, v]) => `${t} ${Number.isInteger(v) ? v : v.toFixed(1)} (${levelWord(v)})`).join(", ")}`;

// What a reply is told: their scores toward the user and the people who
// matter here (in a group, the others present; in a 1:1, the few they feel
// most strongly about), and how to move them.
export const buildPointsNote = (c: Character | undefined, userName: string, others: Character[], now: number, { group = false }: { group?: boolean } = {}): string | undefined => {
  if (!c || !pointsOn(c.worldId)) return undefined;
  const traits = traitsOf(c.worldId);
  const strength = (v: Record<string, number>, o: Character) => traits.reduce((n, t) => n + Math.abs(v[t] - valuesOf(undefined, [t], baseOf(c, o.id), now)[t]), 0);
  const toward = others
    .filter((o) => o.id !== c.id && o.worldId === c.worldId)
    .map((o) => ({ o, v: pointsToward(c, o.id, now) }))
    .sort((a, b) => (group ? 0 : strength(b.v, b.o) - strength(a.v, a.o)))
    .slice(0, group ? 6 : 3);
  const why = c.youPoints?.why?.[c.youPoints.why.length - 1]?.text;
  return [
    `How you feel, on a 0-10 scale for ${traits.join(", ")} (let it show in how you act and what you say; never mention numbers or points):`,
    `${line(userName, pointsToward(c, "you", now))}${why ? ` (lately: ${why})` : ""}`,
    ...toward.map(({ o, v }) => line(o.name, v)),
    `If this reply really changes how you feel, end it with a tag: [Points: trust +1, affection -1] for ${userName}${group ? ", or [Points Name: rivalry +1] for someone here" : ""}. Steps of 1 (at most 2), only the traits that changed; most replies change nothing, so leave it out.`,
  ].join("\n");
};

// For a talk between two characters: how each scores the other.
export const pointsLine = (a: Character, b: Character, now: number): string | undefined => {
  if (!pointsOn(a.worldId)) return undefined;
  const fmt = (v: Record<string, number>) => Object.entries(v).map(([t, n]) => `${t} ${Math.round(n)}`).join(", ");
  return `How they score each other (0-10): ${a.name} toward ${b.name}: ${fmt(pointsToward(a, b.id, now))}. ${b.name} toward ${a.name}: ${fmt(pointsToward(b, a.id, now))}. Let it show.`;
};
