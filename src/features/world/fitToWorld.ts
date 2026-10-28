import { Character, World } from "../../types";
import { parseCharacterDraft } from "../character/characterDraft";

// Fitting a person to a new world, and changing anyone with AI (#237). Someone
// who joins a world from another one came as an exact copy: a barista with a
// phone in a medieval town. In the world wizard, "Fit to this world" rewrites
// their card for the world - what they do and where they're from, their
// clothes, how they talk, their opening and scenario - keeping who they are;
// "Change with AI" does what you ask ("make her older, and a smuggler"). You
// see each change before and after, can edit it or undo it, and nothing is
// saved until the world is created.

export const FIT_FIELDS = ["description", "prompt", "scenario", "first_mes", "mes_example", "appearance", "visualTags"] as const;
export type FitField = (typeof FIT_FIELDS)[number];
export type FitCard = Partial<Pick<Character, FitField>>;

export const FIT_LABELS: Record<FitField, string> = {
  description: "In a line",
  prompt: "Who they are and how they talk",
  scenario: "Scenario",
  first_mes: "Opening message",
  mes_example: "Example dialogue",
  appearance: "Look and clothes",
  visualTags: "Locked look for pictures",
};

type WorldBasics = Pick<World, "name" | "premise" | "tone" | "era">;

export const fitCardOf = (c: FitCard & { name: string; personalityTraits?: string[]; relationship?: string }): FitCard =>
  Object.fromEntries(FIT_FIELDS.flatMap((f) => (c[f]?.trim() ? [[f, c[f]!.trim()]] : []))) as FitCard;

const SHAPE = `{
  "name": "their name, unchanged",
  "description": "one sentence summing them up",
  "prompt": "4 to 6 sentences of personality and behaviour, in the second person (\\"You are...\\")",
  "scenario": "1 to 2 sentences setting the scene the roleplay opens in",
  "firstMessage": "their in-character opening message, 1 to 3 sentences, *asterisks* for actions",
  "exampleDialogue": "two short exchanges, each formatted as User: <line> then <name>: <reply>, separated by a blank line",
  "appearance": "2 to 3 sentences on how they look and dress",
  "visualTags": "comma-separated fixed visual traits for an image generator, 15 to 45 words"
}`;

const describeWorld = (w: WorldBasics) =>
  [`${w.name}: ${w.premise.trim()}`, w.tone?.trim() && `Tone: ${w.tone.trim()}.`, w.era?.trim() && `Era and technology: ${w.era.trim()}.`].filter(Boolean).join(" ");

const cardText = (name: string, card: FitCard, traits?: string[]) =>
  [`Name: ${name}`, traits?.length ? `Traits: ${traits.join(", ")}` : "", ...FIT_FIELDS.map((f) => (card[f] ? `${FIT_LABELS[f]} (${f}): ${card[f]}` : ""))].filter(Boolean).join("\n");

// `ties`: who they are to the others here, so the rewrite fits them too.
export const buildFitPrompt = (
  { name, card, traits, world, ties = [], instruction }: { name: string; card: FitCard; traits?: string[]; world: WorldBasics; ties?: string[]; instruction?: string }
) =>
  [
    instruction?.trim()
      ? `Change this roleplay character as asked, and only that: "${instruction.trim()}". Everything the request doesn't touch stays as it is, word for word. They live in this world: ${describeWorld(world)}`
      : `This roleplay character is moving into a new world: ${describeWorld(world)}\nRewrite their card so they belong there, as if they'd always lived there. Keep who they are: their name, personality, values, quirks, and their relationship with the user. Change what the world changes:\n- what they do, where they're from and where they live, in this world's terms;\n- their clothes and what they carry, in the era's style (keep their face, hair, build, skin and apparent age exactly);\n- how they talk and write: words, slang and habits of the era (no texting slang in a world without phones, no modern brands);\n- their opening message and scenario, set in this world.`,
    ties.length ? `\nWho they are to people here:\n${ties.map((t) => `- ${t}`).join("\n")}` : "",
    `\nTheir card now:\n${cardText(name, card, traits)}`,
    `\nRespond with ONLY a single valid JSON object in exactly this shape, no fences, no commentary. Give every field, unchanged ones as they were:\n${SHAPE}`,
  ].filter(Boolean).join("\n");

// The fields that came back different, ready to lay over the card. The name
// is never changed here.
export const parseFit = (reply: string, before: FitCard): FitCard => {
  const draft = parseCharacterDraft(reply);
  const next: FitCard = {
    description: draft.description,
    prompt: draft.prompt,
    scenario: draft.scenario,
    first_mes: draft.first_mes,
    mes_example: draft.mes_example,
    appearance: draft.appearance,
    visualTags: draft.visualTags,
  };
  return Object.fromEntries(FIT_FIELDS.flatMap((f) => (next[f]?.trim() && next[f]!.trim() !== (before[f] || "").trim() ? [[f, next[f]!.trim()]] : []))) as FitCard;
};

// A person's changes while the wizard is open: each step is the whole set
// laid over their card so far, so undo is stepping back.
export interface FitHistory {
  steps: { fields: FitCard; how: string }[];
}

export const currentFit = (h: FitHistory | undefined): FitCard => h?.steps[h.steps.length - 1]?.fields || {};

export const withFit = (h: FitHistory | undefined, change: FitCard, how: string): FitHistory => ({
  steps: [...(h?.steps || []), { fields: { ...currentFit(h), ...change }, how }],
});

export const undoFit = (h: FitHistory | undefined): FitHistory | undefined =>
  h && h.steps.length > 1 ? { steps: h.steps.slice(0, -1) } : undefined;

// An edit by hand to the latest step's text.
export const editFit = (h: FitHistory, field: FitField, value: string): FitHistory => ({
  steps: [...h.steps.slice(0, -1), { ...h.steps[h.steps.length - 1], fields: { ...currentFit(h), [field]: value } }],
});

// What the latest step changed, before and after, for the review.
export const lastChanges = (base: FitCard, h: FitHistory | undefined): { field: FitField; before: string; after: string }[] => {
  if (!h?.steps.length) return [];
  const before = { ...base, ...(h.steps.length > 1 ? h.steps[h.steps.length - 2].fields : {}) };
  const after = { ...base, ...currentFit(h) };
  return FIT_FIELDS.flatMap((f) => ((after[f] || "") !== (before[f] || "") ? [{ field: f, before: before[f] || "", after: after[f] || "" }] : []));
};
