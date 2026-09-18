import { LoreEntry } from "../../types";
import { ParsedCharacterCard } from "./characterCard";

// The subset of a parsed character card that's actually shown in the import
// review dialog and sent to the AI for a customize pass - deliberately
// leaves out appearanceImages/accent/autoSelfie/artStyle/personalityTraits,
// which either aren't text (images) or aren't meaningful edit targets for a
// freeform instruction, so they just ride along unchanged.
export interface ImportCustomizeFields {
  name: string;
  description: string;
  prompt: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  tags: string[];
  relationship: string;
  appearance: string;
  loreEntries: LoreEntry[];
}

export const pickCustomizeFields = (card: ParsedCharacterCard): ImportCustomizeFields => ({
  name: card.name || "",
  description: card.description || "",
  prompt: card.prompt || "",
  scenario: card.scenario || "",
  first_mes: card.first_mes || "",
  mes_example: card.mes_example || "",
  tags: card.tags || [],
  relationship: card.relationship || "",
  appearance: card.appearance || "",
  loreEntries: card.loreEntries || [],
});

export const applyCustomizeFields = (base: ParsedCharacterCard, fields: ImportCustomizeFields): ParsedCharacterCard => ({
  ...base,
  ...fields,
});

// Sent to the AI alongside the user's instruction so it knows the exact
// shape to hand back - "keys" mirrors the community card spec's own field
// name so the model isn't tempted to invent one.
const CUSTOMIZE_RESPONSE_SHAPE = `{
  "name": string,
  "description": string,
  "prompt": string,
  "scenario": string,
  "first_mes": string,
  "mes_example": string,
  "tags": string[],
  "relationship": string,
  "appearance": string,
  "loreEntries": [{ "keywords": string[], "content": string, "enabled": boolean }]
}`;

export const buildImportCustomizePrompt = (fields: ImportCustomizeFields, instruction: string): string =>
  `You are helping a user customize a character (and its lorebook) they just imported, before they save it. Here is the current data as JSON:\n\n${JSON.stringify(fields, null, 2)}\n\n"loreEntries" is the character's lorebook - each entry's "content" is only added to the AI's context when one of its "keywords" is mentioned in the conversation.\n\nApply this requested change, leaving every other field exactly as-is unless the change implies otherwise:\n${instruction}\n\nRespond with ONLY a single valid JSON object matching this exact shape, no markdown code fences, no commentary, no extra keys:\n${CUSTOMIZE_RESPONSE_SHAPE}`;

const freshLoreEntryId = (i: number) =>
  `book_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 7)}`;

const asStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

// The model is told to reply with strict JSON, but for multi-line fields
// like "prompt" or "mes_example" it very often pastes a literal newline
// inside the string instead of escaping it as \n - valid as *text*, but
// JSON.parse rejects raw control characters inside a string literal. This
// walks the text tracking whether it's inside a "..." string (respecting
// backslash escapes) and escapes any bare newline/tab/carriage-return it
// finds there, leaving whitespace outside strings untouched.
const escapeBareControlCharsInStrings = (text: string): string => {
  let result = "";
  let inString = false;
  let escapedNext = false;
  for (const ch of text) {
    if (inString) {
      if (escapedNext) {
        result += ch;
        escapedNext = false;
      } else if (ch === "\\") {
        result += ch;
        escapedNext = true;
      } else if (ch === '"') {
        inString = false;
        result += ch;
      } else if (ch === "\n") {
        result += "\\n";
      } else if (ch === "\r") {
        result += "\\r";
      } else if (ch === "\t") {
        result += "\\t";
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
};

// A trailing comma before a closing `}`/`]` is invalid JSON but a common
// model slip (especially when it's editing an array/object it was shown as
// an example) - strip it rather than reject the whole response over it.
const stripTrailingCommas = (text: string): string => text.replace(/,(\s*[}\]])/g, "$1");

// Defensive parse - the model is asked for strict JSON but still sometimes
// wraps it in a ```json fence, adds a stray sentence, leaves a trailing
// comma, or pastes literal newlines inside a string - this tries to salvage
// all of that before giving up, then rebuilds every field with the same
// fallback-to-empty-string behavior parseCharacterCardJson uses.
export const parseImportCustomizeResponse = (text: string): ImportCustomizeFields => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    console.error("Import customize: no JSON object found in AI response:", text);
    throw new Error("The AI's response wasn't valid JSON. Try rephrasing your request.");
  }
  const candidate = stripTrailingCommas(escapeBareControlCharsInStrings(cleaned.slice(start, end + 1)));
  let parsed: any;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    console.error("Import customize: failed to parse AI response as JSON:", err, text);
    throw new Error("The AI's response wasn't valid JSON. Try rephrasing your request.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The AI's response wasn't valid JSON. Try rephrasing your request.");
  }

  const loreEntries: LoreEntry[] = Array.isArray(parsed.loreEntries)
    ? parsed.loreEntries.map((entry: any, i: number) => ({
        id: freshLoreEntryId(i),
        keywords: asStringArray(entry?.keywords),
        content: typeof entry?.content === "string" ? entry.content : "",
        enabled: entry?.enabled !== false,
      }))
    : [];

  return {
    name: typeof parsed.name === "string" ? parsed.name : "",
    description: typeof parsed.description === "string" ? parsed.description : "",
    prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
    scenario: typeof parsed.scenario === "string" ? parsed.scenario : "",
    first_mes: typeof parsed.first_mes === "string" ? parsed.first_mes : "",
    mes_example: typeof parsed.mes_example === "string" ? parsed.mes_example : "",
    tags: asStringArray(parsed.tags),
    relationship: typeof parsed.relationship === "string" ? parsed.relationship : "",
    appearance: typeof parsed.appearance === "string" ? parsed.appearance : "",
    loreEntries,
  };
};
