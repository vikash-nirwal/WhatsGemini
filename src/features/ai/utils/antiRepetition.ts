// Anti-repetition guard (#19): long roleplays drift into the same phrases
// and the same openings ("*smiles softly*", "I can't help but..."). This
// finds word runs the character's last few replies keep reusing, and the
// next reply gets a one-turn note to avoid them.

const WINDOW = 5; // recent replies looked at
const MIN_WORDS = 4;
const MAX_WORDS = 7;
const MAX_PHRASES = 6;
// Runs made only of these say nothing about style ("i don't know if you").
const FILLER = new Set(["i", "you", "it", "to", "the", "a", "an", "and", "of", "in", "on", "is", "that", "this", "me", "my", "your", "be", "do", "don't", "for", "with", "at", "so", "just", "was", "are", "if", "we", "what"]);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/\[image context:[\s\S]*?\]/gi, " ")
    .replace(/[^a-z0-9'\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const phrasesOf = (tokens: string[], n: number): Set<string> => {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) {
    const run = tokens.slice(i, i + n);
    if (run.every((w) => FILLER.has(w))) continue;
    out.add(run.join(" "));
  }
  return out;
};

// Phrases used in at least two of the recent replies, longest first, with
// shorter pieces of an already-listed phrase dropped.
export const findRepeatedPhrases = (replies: string[]): string[] => {
  const recent = replies.slice(-WINDOW).map(words).filter((t) => t.length >= MIN_WORDS);
  if (recent.length < 2) return [];
  const counts = new Map<string, number>();
  for (let n = MAX_WORDS; n >= MIN_WORDS; n--) {
    for (const tokens of recent) {
      Array.from(phrasesOf(tokens, n)).forEach((p) => counts.set(p, (counts.get(p) || 0) + 1));
    }
  }
  const repeated = Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .map(([p]) => p)
    .sort((a, b) => b.split(" ").length - a.split(" ").length || a.localeCompare(b));
  // A repeat longer than MAX_WORDS shows up as overlapping pieces; join them
  // back into the whole phrase.
  const joined = joinOverlaps(repeated.filter((p) => p.split(" ").length === MAX_WORDS));
  const kept: string[] = [];
  for (const p of [...joined, ...repeated]) {
    if (kept.some((k) => ` ${k} `.includes(` ${p} `))) continue;
    kept.push(p);
    if (kept.length >= MAX_PHRASES) break;
  }
  return kept;
};

// Joins phrases where one ends with the other's start ("a b c d" and
// "b c d e" make "a b c d e"), until nothing more joins.
const joinOverlaps = (phrases: string[]): string[] => {
  let list = phrases.map((p) => p.split(" "));
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const a = list[i];
        const b = list[j];
        const overlap = MAX_WORDS - 1;
        if (a.slice(-overlap).join(" ") === b.slice(0, overlap).join(" ")) {
          const merged = [...a, ...b.slice(overlap)];
          list = list.filter((_, k) => k !== i && k !== j).concat([merged]);
          changed = true;
          break outer;
        }
      }
    }
  }
  return list.map((w) => w.join(" ")).sort((a, b) => b.split(" ").length - a.split(" ").length);
};

// The same first three words in at least two of the last three replies.
export const findRepeatedOpening = (replies: string[]): string | undefined => {
  const openings = replies.slice(-3).map((r) => words(r).slice(0, 3).join(" ")).filter((o) => o.split(" ").length === 3);
  const seen = new Map<string, number>();
  for (const o of openings) seen.set(o, (seen.get(o) || 0) + 1);
  return Array.from(seen.entries()).find(([, c]) => c >= 2)?.[0];
};

export const buildAvoidNote = (phrases: string[], opening?: string): string | undefined => {
  if (phrases.length === 0 && !opening) return undefined;
  const parts: string[] = [];
  if (phrases.length > 0) parts.push(`Your recent replies keep reusing these phrases; don't use them in this reply, and say it differently: ${phrases.map((p) => `"${p}"`).join(", ")}.`);
  if (opening) parts.push(`Several replies started with "${opening}"; open this one differently.`);
  return parts.join(" ");
};
