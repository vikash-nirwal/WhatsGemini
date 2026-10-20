// Locked appearance (#34): a short, fixed list of visual traits per
// character (Character.visualTags) that goes into every image prompt word
// for word. Prompt-writing models paraphrase a free-text appearance a little
// differently each time, so faces drift; a fixed line, placed early in the
// prompt, keeps every provider - text-only ones included - drawing the same
// person. The model still writes the scene; it just never rewrites the look.

import { Outfit } from "../../../types";

export interface AppearanceLock {
  name: string;
  visualTags: string;
}

type LookSource = { name: string; visualTags?: string; wardrobe?: Outfit[]; currentOutfitId?: string };

// The outfit a character is wearing now (#50), if one is picked.
export const currentOutfit = (c: Pick<LookSource, "wardrobe" | "currentOutfitId">): Outfit | undefined =>
  c.currentOutfitId ? c.wardrobe?.find((o) => o.id === c.currentOutfitId && o.description.trim()) : undefined;

// The locked look with today's outfit (#50) after it. The outfit comes last
// and is labelled, so it overrides any clothing in the fixed traits while
// the face, hair and build stay word for word the same.
export const lockedLookFor = (c: LookSource): string => {
  const tags = (c.visualTags || "").trim();
  const outfit = currentOutfit(c)?.description.trim();
  if (!outfit) return tags;
  return tags ? `${tags.replace(/[.;,\s]+$/, "")}; outfit: ${outfit}` : `outfit: ${outfit}`;
};

// Characters in the picture that actually have a locked look.
export const appearanceLocksFor = (characters: LookSource[]): AppearanceLock[] =>
  characters
    .map((c) => ({ name: c.name.trim(), visualTags: lockedLookFor(c) }))
    .filter((c) => c.name && c.visualTags);

// The instruction added to the image-prompt request.
export const buildAppearanceLockInstruction = (locks: AppearanceLock[]): string => {
  if (locks.length === 0) return "";
  const lines = locks.map((l) => `- ${l.name}: ${l.visualTags}`).join("\n");
  return `Locked appearance - copy each character's description into the prompt exactly as written, word for word, and don't change, shorten or add to their face, hair, body or marks. When a description ends with an outfit, it replaces any clothing listed before it. Describe only the scene, pose, expression, lighting and framing yourself:\n${lines}`;
};

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Makes sure every locked description really is in the final prompt, since
// models still sometimes paraphrase it. Missing ones go at the front, where
// image models weigh words most: as plain tags for tag-style prompts (SD),
// as "Name: ..." sentences otherwise.
export const applyAppearanceLocks = (prompt: string, locks: AppearanceLock[], style: "tags" | "sentences"): string => {
  const haystack = normalize(prompt);
  const missing = locks.filter((l) => !haystack.includes(normalize(l.visualTags)));
  if (missing.length === 0) return prompt;
  const prefix = style === "tags"
    ? missing.map((l) => l.visualTags).join(", ")
    : missing.map((l) => `${l.name}: ${l.visualTags.replace(/[.\s]+$/, "")}.`).join(" ");
  return style === "tags" ? `${prefix}, ${prompt}` : `${prefix} ${prompt}`;
};

// The AI-assist instruction that drafts a locked look from a character's
// free-text appearance, for the editor's "Draft from appearance" button.
export const buildVisualTagsDraftPrompt = (name: string, appearance: string): string =>
  `Turn this character description into a short, fixed list of visual traits for an image generator, so the same person can be drawn the same way every time.

Character: ${name}
Description: ${appearance}

- Include only things that never change between pictures: apparent age, build, skin tone, face shape, eye colour and shape, hair colour, length and style, facial hair, distinguishing marks (scars, freckles, tattoos, piercings), and their usual outfit.
- Leave out mood, pose, setting, lighting and anything temporary.
- Comma-separated, 15 to 45 words, concrete and visual (for example "green almond-shaped eyes", not "captivating eyes").
- Output only the list: no name, no label, no explanation.`;

export const cleanVisualTags = (reply: string): string =>
  reply
    .trim()
    .replace(/^(visual traits|traits|tags)\s*:\s*/i, "")
    .replace(/^["“']|["”']$/g, "")
    .replace(/\s*\n+\s*/g, ", ")
    .replace(/^[-*•]\s*/, "")
    .replace(/,\s*,/g, ",")
    .trim();
