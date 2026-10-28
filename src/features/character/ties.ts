import { Character } from "../../types";

// Relationships between characters (#144's ties, editable any time): each
// side keeps what the other is to them ("your older brother"), and both
// know about each other (#74). Stored per world, on each character.

export interface TieView {
  other: Character;
  toMe: string; // what `other` is to this character: "older brother"
  toThem: string; // what this character is to `other`: "little sister"
  story?: string; // how they know each other (#237)
}

const bare = (tie: string) => tie.replace(/^your\s+/i, "").trim();
const yours = (tie: string) => (tie.trim() ? `your ${bare(tie)}` : "");

// This character's relationships, as plain words both ways.
export const tiesOf = (c: Character, characters: Character[]): TieView[] =>
  (c.ties || [])
    .map((t) => {
      const other = characters.find((o) => o.id === t.withId);
      if (!other) return undefined;
      const back = other.ties?.find((x) => x.withId === c.id)?.tie || "";
      return { other, toMe: bare(t.tie), toThem: bare(back), ...(t.story ? { story: t.story } : {}) };
    })
    .filter((t): t is TieView => Boolean(t));

// Sets the relationship both ways; returns the two characters to save.
// `story` (#237): how they know each other; left out, it stays as it was,
// since a tie that changes (friends to exes) keeps its history.
export const withTie = (a: Character, b: Character, bToA: string, aToB: string, story?: string): [Character, Character] => {
  const set = (c: Character, other: Character, tie: string): Character => {
    const ties = (c.ties || []).filter((t) => t.withId !== other.id);
    const was = (c.ties || []).find((t) => t.withId === other.id)?.story;
    const keepStory = (story === undefined ? was : story.trim()) || undefined;
    const knows = c.knowsAbout?.includes(other.id) ? c.knowsAbout : [...(c.knowsAbout || []), other.id];
    return { ...c, ties: tie.trim() ? [...ties, { withId: other.id, tie: yours(tie), ...(keepStory ? { story: keepStory } : {}) }] : ties.length ? ties : undefined, knowsAbout: knows };
  };
  return [set(a, b, bToA), set(b, a, aToB)];
};

// Removes it both ways. They still know each other.
export const withoutTie = (a: Character, b: Character): [Character, Character] => {
  const drop = (c: Character, otherId: number): Character => {
    const ties = (c.ties || []).filter((t) => t.withId !== otherId);
    return { ...c, ties: ties.length ? ties : undefined };
  };
  return [drop(a, b.id), drop(b, a.id)];
};
