// Who's in the world, as much as these prompts need.
export type CastLite = { name: string; description?: string; relationship?: string };

// Who someone is, for suggestions: many characters have no description and
// keep everything in their prompt, and a name alone gave generic ideas.
export const castLiteOf = (c: { name: string; description?: string; about?: string; prompt?: string; personality?: string; personalityTraits?: string[]; relationship?: string }): CastLite => {
  const about = [c.description, c.about, c.personality, c.personalityTraits?.length ? `Traits: ${c.personalityTraits.join(", ")}` : "", c.prompt]
    .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return { name: c.name, description: about.length > 400 ? `${about.slice(0, 397).trimEnd()}...` : about || undefined, relationship: c.relationship };
};

// AI help for making and editing a world (#144, the user's 2026-10-26 ask):
// a suggestion for any field, filling every empty field at once, and new
// people who'd fit the cast already there. Prompts and lenient readers only.

export type WorldField = "name" | "premise" | "tone" | "era" | "details";
type WorldDraft = { name?: string; premise?: string; tone?: string; era?: string; details?: string };

const FIELD_ASK: Record<WorldField, string> = {
  name: "a name for this world (2-4 words, evocative, no quotes)",
  premise: "a premise: 2-3 sentences on where and when it is, what's unusual about it, and what everyday life is like",
  tone: "its tone in 2-5 words (e.g. \"Cozy small-town drama\")",
  era: "its era or technology in a short phrase, including how people reach each other (e.g. \"Medieval, news travels by letter\")",
  details: "a longer background: 4-6 sentences of history, factions, rules, notable places",
};

const describe = (w: WorldDraft, cast: CastLite[]) =>
  [
    w.name && `Name: ${w.name}`,
    w.premise && `Premise: ${w.premise}`,
    w.tone && `Tone: ${w.tone}`,
    w.era && `Era: ${w.era}`,
    w.details && `Background: ${w.details}`,
    cast.length && `People who live there: ${cast.map((c) => `${c.name}${c.description ? ` (${c.description})` : ""}`).join("; ")}`,
  ].filter(Boolean).join("\n");

export const buildWorldFieldPrompt = (field: WorldField, world: WorldDraft, cast: CastLite[] = []) => {
  const known = describe({ ...world, [field]: undefined }, cast);
  const current = (world as Record<string, string | undefined>)[field]?.trim();
  return [
    "You help someone build a world for a chat app where AI characters live their lives.",
    known ? `What they have so far:\n${known}` : "They haven't written anything yet; surprise them with something fresh and specific.",
    current ? `Their current ${field}: "${current}". Offer a different, better one.` : "",
    `Write ${FIELD_ASK[field]}. Reply with only that text, no label or quotes.`,
  ].filter(Boolean).join("\n\n");
};

const strip = (s: string) => s.trim().replace(/^```\w*\s*|\s*```$/g, "").replace(/^(name|premise|tone|era|background|details)\s*:\s*/i, "").replace(/^["“']|["”']$/g, "").trim();
export const cleanFieldSuggestion = (reply: string) => strip(reply);

export const buildWorldFillPrompt = (world: WorldDraft, cast: CastLite[] = []) => {
  const missing = (Object.keys(FIELD_ASK) as WorldField[]).filter((f) => !(world as Record<string, string | undefined>)[f]?.trim());
  return [
    "You help someone build a world for a chat app where AI characters live their lives.",
    describe(world, cast) ? `What they have so far:\n${describe(world, cast)}` : "They haven't written anything yet; invent something fresh and specific.",
    `Fill in what's missing, consistent with what's there: ${missing.map((f) => `"${f}": ${FIELD_ASK[f]}`).join("; ")}.`,
    `Reply with only JSON: {${missing.map((f) => `"${f}": "..."`).join(", ")}}`,
  ].join("\n\n");
};

const readJson = (reply: string): unknown => {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : reply).trim();
  for (const [open, close] of [["[", "]"], ["{", "}"]] as const) {
    const a = body.indexOf(open), b = body.lastIndexOf(close);
    if (a < 0 || b <= a) continue;
    try {
      return JSON.parse(body.slice(a, b + 1).replace(/,\s*([\]}])/g, "$1"));
    } catch {
      // try the other bracket
    }
  }
  return undefined;
};

export const parseWorldFill = (reply: string): WorldDraft => {
  const data = readJson(reply);
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: WorldDraft = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const key = k.toLowerCase().replace(/[^a-z]/g, "");
    const field = key === "background" || key === "settingdetails" ? "details" : key;
    if (typeof v === "string" && v.trim() && field in FIELD_ASK) (out as Record<string, string>)[field] = strip(v);
  }
  return out;
};

export interface CastSuggestion {
  name: string;
  idea: string; // one line, for the character draft
  tieWith?: string; // someone already in the cast
  tie?: string; // what the new person is to them
}

// New people who'd fill the world, each tied to someone already there.
export const buildCastSuggestionsPrompt = (world: WorldDraft, cast: CastLite[], skip: string[] = [], count = 4) =>
  [
    `A world for a chat app where AI characters live their lives:\n${describe(world, [])}`,
    cast.length ? `Who lives there now:\n${cast.map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ""}`).join("\n")}` : "Nobody lives there yet.",
    cast.length
      ? `Suggest ${count} new people who belong in these people's lives: each one tied to someone listed above by name (family, friend, ex, rival, coworker, neighbour), who fits that person's story, background and setting - someone that character would actually have in their life. Spread them across the people listed. Lives and wants of their own; mix ages and roles.${skip.length ? ` Not these, and not like them: ${skip.join(", ")}.` : ""}`
      : `Suggest ${count} new people who would make it feel lived-in, with lives and wants of their own. Mix ages and roles.${skip.length ? ` Not these: ${skip.join(", ")}.` : ""}`,
    'Reply with only JSON: [{"name": "full name", "idea": "one line: who they are, what they do, what makes them interesting", "tieWith": "name of someone already there, or \\"\\"", "tie": "what the new person is to them, e.g. older brother, or \\"\\""}]',
  ].join("\n\n");

export const parseCastSuggestions = (reply: string, cast: CastLite[]): CastSuggestion[] => {
  const data = readJson(reply);
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? Object.values(data as Record<string, unknown>).find(Array.isArray) : undefined;
  if (!Array.isArray(list)) return [];
  const taken = new Set(cast.map((c) => c.name.trim().toLowerCase()));
  const out: CastSuggestion[] = [];
  for (const item of list as Record<string, unknown>[]) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const idea = typeof item?.idea === "string" ? item.idea.trim() : typeof item?.description === "string" ? item.description.trim() : "";
    if (!name || !idea || taken.has(name.toLowerCase())) continue;
    taken.add(name.toLowerCase());
    const withName = typeof item?.tieWith === "string" ? item.tieWith.trim() : "";
    const match = cast.find((c) => c.name.toLowerCase() === withName.toLowerCase() || c.name.toLowerCase().split(/\s+/)[0] === withName.toLowerCase().split(/\s+/)[0]);
    const tie = typeof item?.tie === "string" ? item.tie.trim().replace(/^your\s+/i, "") : "";
    out.push({ name, idea, ...(match && tie ? { tieWith: match.name, tie } : {}) });
  }
  return out;
};

// The way back, for the tie the other side holds: "older brother" of a
// sister is guessed as "younger sister" only by the user or the AI, so this
// just mirrors plain words when nothing better is known.
export const MIRROR: Record<string, string> = {
  "older sister": "younger sibling", "younger sister": "older sibling", "older brother": "younger sibling", "younger brother": "older sibling",
  mother: "child", father: "child", daughter: "parent", son: "parent", mentor: "student", student: "mentor", boss: "employee",
};
export const mirrorTie = (tie: string) => MIRROR[tie.trim().toLowerCase()] || tie.trim();

export type { WorldDraft };
