// Character names stay out of image prompts (the user's call, 2026-10-27).
// An image model draws from what a person looks like; a name tells it
// nothing it can draw, can pull the picture towards a real or famous
// person who shares it, and shouldn't leave the device for no reason. So
// every name is swapped for a neutral label before a prompt goes out:
// "the character" when one person is drawn, "person 1", "person 2", … in
// reference order when several are, so the legend still says which face
// is whose.
//
// For a chat picture's prompt (2026-11-18), the prompt writer itself gets no
// names either, and people are called what they look like instead: "the
// woman", "the man", "the first woman" and "the second woman" when two
// women are in it. The text model writes a better prompt from "the woman"
// than from "person 1", and an image model knows what to draw from it.

export type PersonKind = "woman" | "man";

const ORDINALS = ["first", "second", "third", "fourth", "fifth"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Labels for the names given, in order. Duplicates and blanks are dropped.
// With `kindOf`, each person is labelled by what they are (someone whose
// gender isn't known is "the person"), numbered only among their own kind.
export const nameLabels = (names: (string | undefined)[], kindOf?: (name: string) => PersonKind | undefined): Map<string, string> => {
  const unique = Array.from(new Set(names.map((n) => n?.trim()).filter((n): n is string => Boolean(n))));
  if (!kindOf) return new Map(unique.map((n, i) => [n, unique.length === 1 ? "the character" : `person ${i + 1}`]));
  const kinds = new Map(unique.map((n) => [n, kindOf(n) || "person"]));
  return new Map(unique.map((n) => {
    const kind = kinds.get(n)!;
    const same = unique.filter((m) => kinds.get(m) === kind);
    const i = same.indexOf(n);
    return [n, same.length === 1 ? `the ${kind}` : i < ORDINALS.length ? `the ${ORDINALS[i]} ${kind}` : `${kind} ${i + 1}`];
  }));
};

// Whether a character or persona is a woman or a man, from how they're
// described. There's no gender field, so the words are counted: a look
// ("a tall woman", "1girl") counts most, then the pronouns their card uses.
// Unclear stays unknown, and they're "the person".
const WOMAN = /\b(she|her|hers|herself|woman|women|girl|lady|female|wife|girlfriend|mother|daughter|sister|queen|princess|1girl)\b/gi;
const MAN = /\b(he|him|his|himself|man|men|boy|guy|male|husband|boyfriend|father|son|brother|king|prince|1boy)\b/gi;
const count = (text: string, words: RegExp) => (text.match(words) || []).length;

export const guessKind = (look: string, about = ""): PersonKind | undefined => {
  const w = count(look, WOMAN) * 3 + count(about, WOMAN);
  const m = count(look, MAN) * 3 + count(about, MAN);
  if (w >= 2 && w >= m * 2) return "woman";
  if (m >= 2 && m >= w * 2) return "man";
  return undefined;
};

// A lookup by name for everyone given, for `nameLabels`.
export const kindLookup = (people: { name?: string; look?: string; about?: string }[]): ((name: string) => PersonKind | undefined) => {
  const kinds = new Map<string, PersonKind | undefined>();
  for (const p of people) {
    const key = p.name?.trim().toLowerCase();
    if (key && !kinds.get(key)) kinds.set(key, guessKind(p.look || "", p.about || ""));
  }
  return (name) => kinds.get(name.trim().toLowerCase());
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
  // A label that starts a sentence starts with a capital, as the name did.
  const fit = (label: string, at: number, text: string) => (at === 0 || /[.!?]\s+$/.test(text.slice(0, at)) ? label[0].toUpperCase() + label.slice(1) : label);
  return pairs.reduce((text, [name, label]) => text.replace(wordPattern(name), (_m, at: number, whole: string) => fit(label, at, whole)), prompt);
};
