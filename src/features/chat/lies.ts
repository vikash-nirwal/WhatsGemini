import { ToldLie } from "../../types";

// Lies (#100): with the switch on, the character may tell a small lie when
// they really would, and close that reply with [Lie: the truth]. The truth is
// kept on the chat but hidden from you unless you ask the Story tab for it.
// Lies still standing go back into the prompt, so they stay consistent; if
// you catch them out, the reply that admits it adds [Lie caught: n].

const KEEP = 20;
const IN_PROMPT = 6;

export const newLieId = () => `lie-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const standingLies = (lies: ToldLie[] | undefined): ToldLie[] => (lies || []).filter((l) => !l.caught).slice(-IN_PROMPT);

// What they said, short enough for the prompt and the Story tab.
export const lieExcerpt = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 137).trimEnd()}...` : flat;
};

export const addLie = (lies: ToldLie[] | undefined, said: string, truth: string, now: number): ToldLie[] =>
  [...(lies || []), { id: newLieId(), said: lieExcerpt(said), truth: truth.trim(), at: now }].slice(-KEEP);

// Marks the n-th standing lie (1-based, as the prompt numbered them) caught.
export const catchLie = (lies: ToldLie[] | undefined, n: number, now: number): ToldLie[] | undefined => {
  const target = standingLies(lies)[n - 1];
  if (!target) return undefined;
  return (lies || []).map((l) => (l.id === target.id ? { ...l, caught: now } : l));
};

export const buildLiesSection = (name: string, userName: string, lies: ToldLie[] | undefined): string => {
  const lines = [
    `${name} can lie. When ${name} really would - to save face, hide a surprise, spare ${userName}'s feelings or protect a secret - tell a small, believable lie, rarely, and never about anything that matters to ${userName}'s safety. In that reply, add [Lie: the truth, in a few words] on its own line at the very end. Never hint in the reply itself that it's a lie.`,
  ];
  const standing = standingLies(lies);
  if (standing.length > 0) {
    lines.push(`Lies you've told ${userName} that still stand - stay consistent with them:`);
    standing.forEach((l, i) => lines.push(`${i + 1}. You said: "${l.said}" (the truth: ${l.truth})`));
    lines.push(`If ${userName} catches you out - points out a contradiction or finds out - admit it or double down, as ${name} would. In the reply where the truth comes out, add [Lie caught: n] (that lie's number) on its own line at the very end.`);
  }
  return lines.join("\n");
};
