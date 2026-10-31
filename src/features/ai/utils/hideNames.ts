// Character names stay out of image prompts (the user's call, 2026-10-27).
// An image model draws from what a person looks like; a name tells it
// nothing it can draw, can pull the picture towards a real or famous
// person who shares it, and shouldn't leave the device for no reason. So
// every name is swapped for a neutral label before a prompt goes out:
// "the character" when one person is drawn, "person 1", "person 2", … in
// reference order when several are, so the legend still says which face
// is whose.

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Labels for the names given, in order. Duplicates and blanks are dropped.
export const nameLabels = (names: (string | undefined)[]): Map<string, string> => {
  const unique = Array.from(new Set(names.map((n) => n?.trim()).filter((n): n is string => Boolean(n))));
  return new Map(unique.map((n, i) => [n, unique.length === 1 ? "the character" : `person ${i + 1}`]));
};

// The whole name and, when it has more than one word, the first name.
const namesToFind = (name: string): string[] => {
  const first = name.split(/\s+/)[0];
  return first && first !== name && first.length > 2 ? [name, first] : [name];
};
const wordPattern = (name: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${escape(name)}(?![\\p{L}\\p{N}_])`, "giu");

// The names that come up in the prompt. People who are only mentioned (you
// without photos, someone in the group or the scene without photos) aren't
// references, so they get a label only when the prompt names them; one
// who doesn't come up shouldn't turn "the character" into "person 1".
export const namesIn = (prompt: string, names: (string | undefined)[]): string[] =>
  names.filter((n): n is string => Boolean(n?.trim()) && namesToFind(n!.trim()).some((v) => wordPattern(v).test(prompt)));

// The prompt with every name (and every first name, which is how chat text
// usually says it) replaced by its label. Longer names go first, so "Aria
// Vale" isn't half-replaced by "Aria".
export const withoutNames = (prompt: string, labels: Map<string, string>): string => {
  const pairs: [string, string][] = [];
  labels.forEach((label, name) => namesToFind(name).forEach((n) => pairs.push([n, label])));
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs.reduce((text, [name, label]) => text.replace(wordPattern(name), label), prompt);
};
