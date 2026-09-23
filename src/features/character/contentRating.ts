import { Character, ContentRating } from "../../types";

// Phrases that indicate a character is (or may be) under 18. Deliberately
// conservative - a false positive only means the author has to reword the
// card (and sees exactly which phrase triggered it) before it can be marked
// NSFW; a miss would mean sexual content involving a minor, which this app
// must never enable. Ages are matched separately below.
const MINOR_PATTERNS: RegExp[] = [
  /\b(?:loli|lolita|shota|shotacon|lolicon)\b/i,
  /\bunder-?age(?:d)?\b/i,
  /\b(?:is|as|still|being) a minor\b/i,
  /\b(?:pre-?teen|tween)s?\b/i,
  /\b(?:child|kid|little (?:girl|boy)|schoolgirl|schoolboy)\b(?! (?:of|at heart))/i,
  /\b(?:middle|elementary|primary|junior high|grade) school(?:er|s)?\b/i,
  /\bhigh ?school(?:er| student| freshman| sophomore| junior)s?\b/i,
  /\b(?:freshman|sophomore) (?:in|at) high ?school\b/i,
  /\b(?:[1-9]|1[0-7])(?:st|nd|rd|th)[- ]grader?\b/i,
];

// "15 years old", "15-year-old", "15yo", "age: 15", "aged 15".
const AGE_PATTERNS: RegExp[] = [
  /\b(\d{1,2})\s*[- ]?\s*(?:years?|yrs?)[- ]?old\b/gi,
  /\b(\d{1,2})\s*(?:yo|y\/o|y\.o\.)\b/gi,
  /\bage[ds]?\s*[:=]?\s*(\d{1,2})\b/gi,
];

// Every phrase in `texts` suggesting a minor, for showing the author what to
// fix. Empty = nothing found.
export const detectMinorIndicators = (texts: (string | undefined)[]): string[] => {
  const hits = new Set<string>();
  for (const raw of texts) {
    if (!raw) continue;
    for (const re of MINOR_PATTERNS) {
      const m = raw.match(re);
      if (m) hits.add(m[0]);
    }
    for (const re of AGE_PATTERNS) {
      for (const m of Array.from(raw.matchAll(re))) {
        const age = Number(m[1]);
        if (age > 0 && age < 18) hits.add(m[0]);
      }
    }
  }
  return Array.from(hits);
};

// All author-written text on a character that could describe its age.
export const characterTextFields = (c: Partial<Character>): (string | undefined)[] => [
  c.name,
  c.description,
  c.prompt,
  c.scenario,
  c.first_mes,
  ...(c.alternateGreetings || []),
  c.mes_example,
  c.appearance,
  c.relationship,
  ...(c.loreEntries || []).map((e) => e.content),
];

export const hasNsfwTag = (c: Partial<Character>): boolean =>
  (c.tags || []).some((t) => t.trim().toLowerCase() === "nsfw");

// For gallery filtering: anything marked NSFW, or tagged NSFW without an
// explicit SFW rating, confirmed or not.
export const isNsfwCharacter = (c: Partial<Character>): boolean =>
  c.contentRating === "nsfw" || (c.contentRating !== "sfw" && hasNsfwTag(c));

// The rating actually applied to prompts. NSFW requires the explicit 18+
// confirmation AND a clean minor-indicator scan; a card that is marked or
// tagged NSFW without both is held to SFW rather than left unruled.
export const effectiveContentRating = (c: Character | undefined): ContentRating | undefined => {
  if (!c) return undefined;
  if (c.contentRating === "sfw") return "sfw";
  const wantsNsfw = isNsfwCharacter(c);
  if (wantsNsfw) {
    return c.adultsConfirmed && detectMinorIndicators(characterTextFields(c)).length === 0 ? "nsfw" : "sfw";
  }
  return undefined;
};
