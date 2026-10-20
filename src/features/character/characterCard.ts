import { Character, LoreEntry } from "../../types";
import { readPngTextChunk, writePngTextChunk } from "../../utils/pngTextChunk";

// Community-standard "Character Card V2" (TavernAI/SillyTavern) shape -
// https://github.com/malfoyslastname/character-card-spec-v2. Supporting it
// lets characters move between WhatsGemini and any other app that reads
// this format, instead of being locked into WhatsGemini's own JSON shape.
export interface CharacterCardV2 {
  spec: "chara_card_v2";
  spec_version: "2.0";
  data: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes: string;
    system_prompt: string;
    post_history_instructions: string;
    alternate_greetings: string[];
    tags: string[];
    creator: string;
    character_version: string;
    // The spec reserves `extensions` for exactly this - app-specific data
    // other readers are expected to ignore. WhatsGemini fields with no V2
    // equivalent ride along here so a round-trip export/import back into
    // WhatsGemini isn't lossy, without breaking portability elsewhere.
    extensions: {
      whatsgemini?: {
        relationship?: string;
        appearance?: string;
        accent?: [string, string];
        autoSelfie?: Character["autoSelfie"];
        artStyle?: Character["artStyle"];
        loreEntries?: Character["loreEntries"];
        personalityTraits?: Character["personalityTraits"];
        contentRating?: Character["contentRating"];
      };
      [key: string]: unknown;
    };
    // The spec's standard embedded lorebook - what SillyTavern/chub.ai
    // actually populate and read, unlike the whatsgemini-only extension
    // above. Exporting our loreEntries here too (in addition to the
    // extension, which round-trips `enabled` etc. losslessly) is what makes
    // WhatsGemini characters carry their lore into other apps.
    character_book?: {
      extensions: Record<string, unknown>;
      entries: CharacterBookEntry[];
    };
  };
}

// One `character_book` entry as the V2 spec and SillyTavern write it. The
// advanced trigger fields are optional in the spec and only written when the
// WhatsGemini entry sets them, so a plain lorebook exports as it always has.
export interface CharacterBookEntry {
  id: number;
  keys: string[];
  secondary_keys?: string[];
  content: string;
  enabled: boolean;
  constant?: boolean;
  selective?: boolean;
  insertion_order: number;
  priority?: number;
  extensions: Record<string, unknown>;
}

// SillyTavern's `extensions.selectiveLogic` numbers (its world_info_logic
// enum) for how secondary keys combine.
const SELECTIVE_LOGIC: Record<number, LoreEntry["secondaryLogic"]> = { 0: "andAny", 1: "notAll", 2: "notAny", 3: "andAll" };
const SELECTIVE_LOGIC_NUMBER: Record<NonNullable<LoreEntry["secondaryLogic"]>, number> = { andAny: 0, notAll: 1, notAny: 2, andAll: 3 };

const finite = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

// SillyTavern reads `insertion_order` as both placement and budget priority
// (higher is kept first), and ignores the spec's own `priority`. So once a
// lorebook uses priorities, insertion_order carries them (unset counts as 0,
// as in matchLoreEntries); otherwise it stays the entry's position, as it
// always was. `priority` is written too, for readers that follow the spec.
const toCharacterBookEntry = (entry: LoreEntry, i: number, usesPriority: boolean): CharacterBookEntry => {
  const secondary = entry.secondaryKeywords && entry.secondaryKeywords.length > 0 ? entry.secondaryKeywords : undefined;
  const extensions: Record<string, unknown> = {};
  if (entry.secondaryLogic && entry.secondaryLogic !== "andAny") extensions.selectiveLogic = SELECTIVE_LOGIC_NUMBER[entry.secondaryLogic];
  if (finite(entry.scanDepth) !== undefined) extensions.scan_depth = entry.scanDepth;
  if (finite(entry.sticky) !== undefined) extensions.sticky = entry.sticky;
  if (finite(entry.probability) !== undefined) {
    extensions.probability = entry.probability;
    extensions.useProbability = true;
  }
  return {
    id: i,
    keys: entry.keywords,
    ...(secondary ? { secondary_keys: secondary } : {}),
    content: entry.content,
    enabled: entry.enabled !== false,
    constant: entry.constant === true,
    ...(entry.selective ? { selective: true } : {}),
    insertion_order: usesPriority ? finite(entry.priority) ?? 0 : i,
    ...(finite(entry.priority) !== undefined ? { priority: entry.priority } : {}),
    extensions,
  };
};

export const characterToCardV2 = (char: Character): CharacterCardV2 => ({
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: char.name,
    description: char.description || "",
    personality: char.prompt || "",
    scenario: char.scenario || "",
    first_mes: char.first_mes || "",
    mes_example: char.mes_example || "",
    creator_notes: char.creatorNotes || "",
    system_prompt: "",
    post_history_instructions: char.postHistoryInstructions || "",
    alternate_greetings: char.alternateGreetings || [],
    tags: char.tags || [],
    creator: "",
    character_version: "",
    extensions: {
      whatsgemini: {
        relationship: char.relationship,
        appearance: char.appearance,
        accent: char.accent,
        autoSelfie: char.autoSelfie,
        artStyle: char.artStyle,
        loreEntries: char.loreEntries,
        personalityTraits: char.personalityTraits,
        contentRating: char.contentRating,
      },
    },
    character_book: char.loreEntries && char.loreEntries.length > 0 ? {
      extensions: {},
      entries: char.loreEntries.map((entry, i, all) =>
        toCharacterBookEntry(entry, i, all.some((e) => finite(e.priority) !== undefined))),
    } : undefined,
  },
});

// Converts a standard V2/V3 `character_book.entries` array (SillyTavern's
// "keys", not our "keywords") into WhatsGemini's own LoreEntry shape. Each
// entry gets a fresh id since the spec's own `id` is an optional number
// scoped to that one card, not a stable cross-app identifier.
//
// The advanced trigger fields come from where SillyTavern keeps them:
// `secondary_keys`/`selective` and `extensions.selectiveLogic`,
// `extensions.scan_depth` (not `extensions.depth`, which is where in the chat
// SillyTavern inserts the text), `extensions.sticky`, and
// `extensions.probability` unless `useProbability` is explicitly off.
// Priority is the spec's `priority`, else `insertion_order` (SillyTavern's
// budget order); when every entry ends up with the same one it's dropped,
// since equal priorities change nothing. Defaults that change nothing
// (SillyTavern's selective-with-no-secondary-keys, a 100% chance) are left
// unset so the entry reads as plain in the editor.
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];

const fromCharacterBookEntry = (entry: any, i: number): LoreEntry => {
  const ext = entry.extensions && typeof entry.extensions === "object" ? entry.extensions : {};
  const secondary = strings(entry.secondary_keys);
  const hasSecondary = secondary.some((k) => k.trim() !== "");
  const selective = entry.selective === true && hasSecondary;
  const logic = SELECTIVE_LOGIC[finite(ext.selectiveLogic) ?? 0];
  const scanDepth = finite(ext.scan_depth);
  const sticky = finite(ext.sticky);
  const probability = ext.useProbability === false ? undefined : finite(ext.probability);
  const priority = finite(entry.priority) ?? finite(entry.insertion_order);
  return {
    id: `book_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 7)}`,
    keywords: Array.isArray(entry.keys) ? strings(entry.keys) : strings(entry.keywords),
    content: entry.content || "",
    enabled: entry.enabled !== false,
    constant: entry.constant === true || undefined,
    ...(priority !== undefined ? { priority } : {}),
    ...(hasSecondary ? { secondaryKeywords: secondary } : {}),
    ...(selective ? { selective: true } : {}),
    ...(selective && logic && logic !== "andAny" ? { secondaryLogic: logic } : {}),
    ...(scanDepth !== undefined && scanDepth >= 0 ? { scanDepth: Math.floor(scanDepth) } : {}),
    ...(sticky !== undefined && sticky > 0 ? { sticky: Math.floor(sticky) } : {}),
    ...(probability !== undefined && probability < 100 ? { probability: Math.max(0, probability) } : {}),
  };
};

const mapCharacterBookEntries = (entries: any[]): LoreEntry[] => {
  const mapped = entries.filter((e) => e && typeof e === "object").map(fromCharacterBookEntry);
  const priorities = new Set(mapped.map((e) => e.priority));
  if (priorities.size > 1) return mapped;
  mapped.forEach((e) => { delete e.priority; });
  return mapped;
};

export type ParsedCharacterCard = Omit<Character, "id">;

const withDefaults = (partial: Partial<ParsedCharacterCard> & { name: string; prompt: string }): ParsedCharacterCard => ({
  description: "",
  tags: [],
  scenario: "",
  first_mes: "",
  mes_example: "",
  relationship: "",
  appearance: "",
  appearanceImages: [],
  ...partial,
});

// Accepts whichever shape a "character file" JSON turns out to be:
// WhatsGemini's own native export (always has a `prompt` field), a V2 or V3
// card (`{ spec: "chara_card_v2"|"chara_card_v3", data: {...} }` - V3 is a
// superset of V2's fields, so the same extraction covers both), or a
// flat/legacy V1 card (same fields as V2's `data`, no wrapper - what most
// older TavernAI cards use).
export const parseCharacterCardJson = (parsed: any): ParsedCharacterCard => {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid character file: not a JSON object.");
  }

  if ((parsed.spec === "chara_card_v2" || parsed.spec === "chara_card_v3") && parsed.data) {
    const d = parsed.data;
    if (!d.name) throw new Error("Invalid character card: missing name.");
    const ext = d.extensions?.whatsgemini || {};
    // Prefer our own extension's loreEntries (a lossless round-trip of a
    // WhatsGemini-authored card) and only fall back to the standard
    // character_book - what chub.ai/SillyTavern cards actually carry - when
    // that extension isn't present.
    const bookEntries = Array.isArray(d.character_book?.entries) ? d.character_book.entries : undefined;
    // A card's `system_prompt` is its author's own instructions, meant to
    // stand in for the app's global prompt; `{{original}}` is the spec's
    // "insert the app's default here" macro, which has no equivalent here
    // since the rest of the system instruction is always kept anyway.
    const systemPrompt = typeof d.system_prompt === "string" ? d.system_prompt.replace(/\{\{original\}\}/gi, "").trim() : "";
    const personality = typeof d.personality === "string" ? d.personality.trim() : "";
    // Many chub.ai-style cards leave `personality`/`system_prompt` blank and
    // bake the whole persona into `description` instead - fall back to it so
    // those cards don't get rejected for a missing prompt.
    return withDefaults({
      name: d.name,
      description: d.description || "",
      prompt: [systemPrompt, personality].filter(Boolean).join("\n\n") || d.description || "",
      scenario: d.scenario || "",
      first_mes: d.first_mes || "",
      alternateGreetings: Array.isArray(d.alternate_greetings)
        ? d.alternate_greetings.filter((g: unknown): g is string => typeof g === "string" && g.trim() !== "")
        : undefined,
      postHistoryInstructions: typeof d.post_history_instructions === "string" ? d.post_history_instructions : undefined,
      creatorNotes: typeof d.creator_notes === "string" ? d.creator_notes : undefined,
      mes_example: d.mes_example || "",
      tags: d.tags || [],
      relationship: ext.relationship || "",
      appearance: ext.appearance || "",
      accent: ext.accent,
      autoSelfie: ext.autoSelfie,
      artStyle: ext.artStyle,
      loreEntries: ext.loreEntries || (bookEntries ? mapCharacterBookEntries(bookEntries) : undefined),
      personalityTraits: ext.personalityTraits,
      // A card tagged NSFW arrives marked NSFW but unconfirmed: it's held to
      // SFW until someone confirms every character is 18+ (see contentRating.ts).
      // The 18+ confirmation itself is never imported - it's a per-user check.
      contentRating: ext.contentRating || (Array.isArray(d.tags) && d.tags.some((t: unknown) => typeof t === "string" && t.trim().toLowerCase() === "nsfw") ? "nsfw" : undefined),
    });
  }

  // WhatsGemini's own native export always carries a `prompt` field - card
  // formats use `personality` instead, which is the cheapest reliable way
  // to tell the two apart.
  if (typeof parsed.prompt === "string") {
    if (!parsed.name || !parsed.prompt) throw new Error("Invalid character file: missing name or prompt.");
    // The 18+ confirmation is a per-user check, never carried in by a file.
    return withDefaults({ ...parsed, name: parsed.name, prompt: parsed.prompt, adultsConfirmed: undefined });
  }

  if (parsed.name && (typeof parsed.personality === "string" || typeof parsed.first_mes === "string" || typeof parsed.description === "string")) {
    return withDefaults({
      name: parsed.name,
      description: parsed.description || "",
      prompt: parsed.personality || parsed.description || "",
      scenario: parsed.scenario || "",
      first_mes: parsed.first_mes || "",
      mes_example: parsed.mes_example || "",
      tags: parsed.tags || [],
    });
  }

  throw new Error("Unrecognized character file format.");
};

// A card exported/edited on Windows often carries a leading UTF-8 BOM, which
// makes JSON.parse throw on otherwise-valid JSON - strip it first so a card
// isn't rejected over an invisible character.
export const parseCharacterCardText = (text: string): ParsedCharacterCard =>
  parseCharacterCardJson(JSON.parse(text.replace(/^﻿/, "")));

// btoa/atob only handle Latin1 code points - a description/greeting with
// unicode (accents, emoji, non-Latin scripts) needs an actual UTF-8 pass
// through TextEncoder/Decoder first, batched to avoid a call-stack blowup
// on longer cards.
const CHUNK_SIZE = 0x8000;
const bytesToBinaryString = (bytes: Uint8Array): string => {
  let result = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    result += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return result;
};

const utf8ToBase64 = (str: string): string => btoa(bytesToBinaryString(new TextEncoder().encode(str)));

const base64ToUtf8 = (base64: string): string => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

const CARD_PNG_KEYWORD = "chara";

// Embeds this character as a V2 card into `basePng` (must already be a
// well-formed PNG, e.g. straight out of canvas.toBlob) - the SillyTavern
// convention of a normal, still-viewable portrait PNG carrying its own
// character data in a tEXt chunk.
export const buildCharacterCardPng = async (char: Character, basePng: Blob): Promise<Blob> => {
  const base64 = utf8ToBase64(JSON.stringify(characterToCardV2(char)));
  const buffer = await basePng.arrayBuffer();
  return writePngTextChunk(buffer, CARD_PNG_KEYWORD, base64);
};

export const extractCharacterCardFromPng = async (file: Blob): Promise<ParsedCharacterCard> => {
  const buffer = await file.arrayBuffer();
  const base64 = readPngTextChunk(buffer, CARD_PNG_KEYWORD);
  if (!base64) throw new Error("No character card data found in this PNG.");
  return parseCharacterCardJson(JSON.parse(base64ToUtf8(base64)));
};
