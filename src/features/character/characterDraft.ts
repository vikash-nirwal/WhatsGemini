import { ArtStyle, ContentRating } from "../../types";
import { ART_STYLES } from "../../utils/constants";
import { cleanVisualTags } from "../ai/utils/appearanceLock";
import { detectMinorIndicators } from "./contentRating";
import { escapeBareControlCharsInStrings, stripTrailingCommas } from "./importCustomize";

// Character from one line (#45): the user types an idea, one AI call drafts
// the whole character as JSON, and the editor's fields are filled from it
// for the user to review. Nothing here saves anything.

export interface CharacterDraftRequest {
  idea: string;
  contentRating?: ContentRating;
  adultsConfirmed?: boolean;
  artStyle?: ArtStyle;
  // The previous draft's name, so "Try another" gets a different character
  // instead of the same one reworded.
  avoidName?: string;
  // A photo to draft from (#92), as a data: URL; the idea is optional then.
  photo?: string;
}

// Named like the Character fields they fill.
export interface CharacterDraft {
  name: string;
  description: string;
  personalityTraits: string[];
  prompt: string;
  scenario: string;
  first_mes: string;
  alternateGreetings: string[];
  mes_example: string;
  relationship: string;
  appearance: string;
  visualTags: string;
}

export class CharacterDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterDraftError";
  }
}

const MAX_TRAITS = 6;
const MAX_ALTERNATE_GREETINGS = 2;

// The same rule the editor applies before an NSFW card can be saved: an
// explicit NSFW rating, the 18+ confirmation, and nothing in the idea that
// suggests a minor. Anything less is drafted safe for work.
export const draftAllowsNsfw = ({ idea, contentRating, adultsConfirmed }: CharacterDraftRequest): boolean =>
  contentRating === "nsfw" && Boolean(adultsConfirmed) && detectMinorIndicators([idea]).length === 0;

const DRAFT_SHAPE = `{
  "name": "first name, or first and last name",
  "description": "one sentence summing them up",
  "personalityTraits": ["3 to 5 short traits, e.g. \\"grumpy\\""],
  "prompt": "4 to 6 sentences of personality and behaviour, written as direct instructions to the character in the second person (\\"You are...\\"): who they are, how they talk, what they want, their quirks",
  "scenario": "1 to 2 sentences setting the scene the roleplay opens in",
  "firstMessage": "their in-character opening message to the user, 1 to 3 sentences, *asterisks* for actions",
  "alternateGreetings": ["a different opening scene", "another different opening scene"],
  "exampleDialogue": "two short exchanges, each formatted as User: <line> then <name>: <reply>, separated by a blank line",
  "relationship": "a short tagline for their relationship with the user, e.g. \\"Rival\\" or \\"Old friend\\"",
  "appearance": "2 to 3 sentences on how they look and dress",
  "visualTags": "comma-separated fixed visual traits for an image generator, 15 to 45 words: apparent age, build, skin tone, face, eye colour, hair, facial hair, marks, usual outfit; no mood, pose or setting"
}`;

// Character from a photo (#92): the look comes from the picture, the rest is
// invented. A photo is often of a real person, so the draft is a fictional
// character who only looks like them, and anyone who might be under 18 keeps
// the whole draft safe for work, whatever rating was picked.
const PHOTO_RULES = `Base their appearance and visualTags on what the photo shows (apparent age, build, face, hair, clothes), and let its mood and setting suggest their personality and the opening scene. Invent a fictional name and life: never identify or name a real person, even one who looks famous. If anyone in the photo could be under 18, keep the whole draft safe for work.`;

export const buildCharacterDraftPrompt = (request: CharacterDraftRequest): string => {
  const idea = request.idea.trim();
  const rating = draftAllowsNsfw(request)
    ? "This is an adults-only character: mature and sexual themes are allowed where the idea calls for them. Every character must be clearly an adult (18 or older); never describe anyone as under 18 or childlike."
    : "Keep everything safe for work: no sexual or explicit content, even if the idea hints at it.";
  const styleLabel = request.artStyle ? ART_STYLES.find((s) => s.value === request.artStyle)?.label : undefined;
  const style = styleLabel ? `\nPictures of them will be drawn in a ${styleLabel.toLowerCase()} style, so write the appearance to suit it.` : "";
  const another = request.avoidName?.trim()
    ? `\nThis is a second take: make it clearly different from the previous draft, ${request.avoidName.trim()}, with a new name and fresh details.`
    : "";
  const opening = request.photo
    ? `Create an original roleplay AI character from the attached photo${idea ? " and this idea, staying true to both" : ""}, filling in vivid, specific details.${idea ? `\n\nIdea: ${idea}` : ""}

${PHOTO_RULES}`
    : `Create an original roleplay AI character from this one-line idea, staying true to it and filling in vivid, specific details.

Idea: ${idea}`;
  return `${opening}

${rating}${style}${another}

Respond with ONLY a single valid JSON object in exactly this shape, with no markdown code fences and no commentary:
${DRAFT_SHAPE}`;
};

// Keys are compared lowercased with spaces, dashes and underscores removed,
// so "first_message", "First Message" and "firstMessage" all match.
const normalizeKey = (key: string) => key.toLowerCase().replace(/[\s_-]/g, "");

const indexKeys = (obj: Record<string, unknown>): Map<string, unknown> => {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    const key = normalizeKey(k);
    if (!map.has(key)) map.set(key, v);
  }
  return map;
};

const pickString = (fields: Map<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const v = fields.get(key);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

const stringsIn = (v: unknown[]): string[] => v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);

// A list field may come back as an array or, from a sloppier model, as one
// string; `split` says how such a string breaks into items, if at all.
const pickList = (fields: Map<string, unknown>, keys: string[], split?: RegExp): string[] => {
  for (const key of keys) {
    const v = fields.get(key);
    if (Array.isArray(v)) {
      const items = stringsIn(v);
      if (items.length) return items;
    } else if (typeof v === "string" && v.trim()) {
      return split ? stringsIn(v.split(split)) : [v.trim()];
    }
  }
  return [];
};

const unique = (items: string[]): string[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// The JSON object in the reply: inside a ```json fence when there is one,
// otherwise from the first "{" to the last "}", which skips any sentence
// the model put around it.
const extractJsonObject = (text: string): string | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start === -1 || end < start ? null : body.slice(start, end + 1);
};

const UNREADABLE = "The AI's reply wasn't a character draft it could read.";

// Defensive on purpose: models add fences and chatter, leave trailing
// commas, paste raw newlines inside strings, rename keys and drop fields.
// Only a name and a personality are required; everything else falls back
// to empty, and any value of the wrong type is ignored.
export const parseCharacterDraft = (reply: string): CharacterDraft => {
  const json = extractJsonObject(reply.trim());
  if (!json) throw new CharacterDraftError(UNREADABLE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripTrailingCommas(escapeBareControlCharsInStrings(json)));
  } catch {
    throw new CharacterDraftError(UNREADABLE);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new CharacterDraftError(UNREADABLE);
  const fields = indexKeys(parsed as Record<string, unknown>);

  const name = pickString(fields, ["name", "charactername"]);
  // "personality" is the prompt when it's prose and the trait list when
  // it's an array, so each picker only takes the type it wants.
  const prompt = pickString(fields, ["prompt", "persona", "personality", "characterprompt", "systemprompt", "instructions"]);
  if (!name || !prompt) throw new CharacterDraftError("The AI's draft was missing a name or a personality.");

  const firstMes = pickString(fields, ["firstmessage", "firstmes", "greeting", "openingmessage"]);
  const traitsFromPersonality = Array.isArray(fields.get("personality")) ? stringsIn(fields.get("personality") as unknown[]) : [];
  const traits = pickList(fields, ["personalitytraits", "traits"], /[,\n]/);
  const exampleDialogue = pickList(fields, ["exampledialogue", "exampledialogues", "mesexample", "examples"]);
  const visualTags = pickList(fields, ["visualtags", "lockedlook", "visualtraits"]);

  return {
    name,
    description: pickString(fields, ["description", "summary"]),
    personalityTraits: unique((traits.length ? traits : traitsFromPersonality).map((t) => t.replace(/^[-*•]\s*/, "").replace(/\.$/, ""))).slice(0, MAX_TRAITS),
    prompt,
    scenario: pickString(fields, ["scenario", "setting"]),
    first_mes: firstMes,
    alternateGreetings: unique(pickList(fields, ["alternategreetings", "alternates", "othergreetings"]))
      .filter((g) => g !== firstMes)
      .slice(0, MAX_ALTERNATE_GREETINGS),
    mes_example: exampleDialogue.join("\n\n"),
    relationship: pickString(fields, ["relationship", "tagline"]),
    appearance: pickString(fields, ["appearance", "looks"]),
    visualTags: cleanVisualTags(visualTags.join(", ")),
  };
};
