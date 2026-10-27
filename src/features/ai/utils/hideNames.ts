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

// The prompt with every name (and every first name, which is how chat text
// usually says it) replaced by its label. Longer names go first, so "Aria
// Vale" isn't half-replaced by "Aria".
export const withoutNames = (prompt: string, labels: Map<string, string>): string => {
  const pairs: [string, string][] = [];
  labels.forEach((label, name) => {
    pairs.push([name, label]);
    const first = name.split(/\s+/)[0];
    if (first && first !== name && first.length > 2) pairs.push([first, label]);
  });
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs.reduce((text, [name, label]) => text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escape(name)}(?![\\p{L}\\p{N}_])`, "giu"), label), prompt);
};
