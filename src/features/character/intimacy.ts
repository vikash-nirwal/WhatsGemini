import { Character, IntimacyProfile, Message, RelationshipStage, UserProfile } from "../../types";

// Intimacy profile (#73): structured romance details for a character (and
// your persona), sent to the model only when the scene heads that way, so
// characters stay consistent without every prompt carrying them.
//
// Characters know about each other (#74): a character can know you're also
// seeing someone else, from a short summary of that other relationship.

export const INTIMACY_FIELDS: { key: keyof IntimacyProfile; label: string; placeholder: string }[] = [
  { key: "loveLanguage", label: "Love language", placeholder: "e.g. quality time, little gifts" },
  { key: "likes", label: "Likes", placeholder: "e.g. slow dances, being teased" },
  { key: "dislikes", label: "Dislikes and limits", placeholder: "e.g. being rushed, public displays" },
  { key: "flirting", label: "How they flirt", placeholder: "e.g. dry jokes and long looks" },
  { key: "jealousy", label: "When jealous", placeholder: "e.g. goes quiet, then asks too many questions" },
  { key: "experience", label: "Experience", placeholder: "e.g. one long relationship that ended badly" },
];

export const hasIntimacy = (profile: IntimacyProfile | undefined): boolean => Boolean(profile && Object.values(profile).some((v) => typeof v === "string" && v.trim()));

const ROMANTIC = /\b(kiss|kissed|kissing|love|lover|date|dating|flirt|flirting|blush|blushing|cuddle|hug|hold(?:ing)? hands|caress|embrace|romantic|darling|sweetheart|bed|intimate)\b/i;

// When the profile goes in: at a relationship stage of flirting or beyond
// (#70), or, with stages off, when the last few messages turn romantic.
export const intimacyInScope = (stage: RelationshipStage | undefined, messages: Message[]): boolean => {
  if (stage) return stage !== "strangers";
  return messages.slice(-6).some((m) => ROMANTIC.test(m.txt || ""));
};

const lines = (profile: IntimacyProfile | undefined) =>
  INTIMACY_FIELDS.map((f) => (profile?.[f.key]?.trim() ? `- ${f.label}: ${profile[f.key]!.trim()}` : "")).filter(Boolean);

export const buildIntimacySection = (character: Pick<Character, "name" | "intimacy">, persona: Pick<UserProfile, "name" | "intimacy"> | undefined): string | undefined => {
  const own = lines(character.intimacy);
  const theirs = lines(persona?.intimacy);
  if (own.length === 0 && theirs.length === 0) return undefined;
  const userName = persona?.name?.trim() || "the user";
  return [
    own.length > 0 ? `${character.name} in romance (stay true to it):\n${own.join("\n")}` : "",
    theirs.length > 0 ? `What ${userName} likes in romance (honor it, never push past it):\n${theirs.join("\n")}` : "",
  ].filter(Boolean).join("\n");
};

export interface KnownRelationship {
  name: string;
  relationship?: string;
  lastAt?: number;
  recentCount: number; // messages in the last week
  facts: string[];
}

const ago = (now: number, at: number): string => {
  const days = Math.floor((now - at) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `${days} days ago` : days < 30 ? `${Math.floor(days / 7)} weeks ago` : "a while ago";
};

export const buildKnowsSection = (charName: string, userName: string, others: KnownRelationship[], now: number): string | undefined => {
  const parts = others.map((o) => {
    const how = o.recentCount >= 40 ? "they've been talking a lot lately" : o.recentCount > 0 ? "they've talked now and then this week" : o.lastAt ? `they last talked ${ago(now, o.lastAt)}` : "they haven't talked in a while";
    return `- ${o.name}${o.relationship ? ` (${o.relationship})` : ""}: ${how}.${o.facts.length > 0 ? ` You've picked up: ${o.facts.join("; ")}.` : ""}`;
  });
  return parts.length > 0
    ? `${charName} knows ${userName} is also close to others:\n${parts.join("\n")}\nReact the way ${charName} would (curious, jealous, relaxed, protective...), bring it up only when it fits, and don't invent details beyond these.`
    : undefined;
};

// A few of the other character's facts that are about the user, to show
// what this one might have picked up.
export const factsAboutUser = (memory: string[] | undefined, categories: Record<string, string> | undefined, limit = 3): string[] =>
  (memory || []).filter((f) => !categories || !categories[f] || categories[f] !== "story").slice(-limit);
