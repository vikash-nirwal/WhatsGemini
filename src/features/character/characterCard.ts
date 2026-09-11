import { Character } from "../../types";
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
      };
      [key: string]: unknown;
    };
  };
}

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
    creator_notes: "",
    system_prompt: "",
    post_history_instructions: "",
    alternate_greetings: [],
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
      },
    },
  },
});

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
// WhatsGemini's own native export (always has a `prompt` field), a V2 card
// (`{ spec: "chara_card_v2", data: {...} }`), or a flat/legacy V1 card (same
// fields as V2's `data`, no wrapper - what most older TavernAI cards use).
export const parseCharacterCardJson = (parsed: any): ParsedCharacterCard => {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid character file: not a JSON object.");
  }

  if (parsed.spec === "chara_card_v2" && parsed.data) {
    const d = parsed.data;
    if (!d.name) throw new Error("Invalid character card: missing name.");
    const ext = d.extensions?.whatsgemini || {};
    return withDefaults({
      name: d.name,
      description: d.description || "",
      prompt: d.personality || d.system_prompt || "",
      scenario: d.scenario || "",
      first_mes: d.first_mes || "",
      mes_example: d.mes_example || "",
      tags: d.tags || [],
      relationship: ext.relationship || "",
      appearance: ext.appearance || "",
      accent: ext.accent,
      autoSelfie: ext.autoSelfie,
      artStyle: ext.artStyle,
      loreEntries: ext.loreEntries,
      personalityTraits: ext.personalityTraits,
    });
  }

  // WhatsGemini's own native export always carries a `prompt` field - card
  // formats use `personality` instead, which is the cheapest reliable way
  // to tell the two apart.
  if (typeof parsed.prompt === "string") {
    if (!parsed.name || !parsed.prompt) throw new Error("Invalid character file: missing name or prompt.");
    return withDefaults({ ...parsed, name: parsed.name, prompt: parsed.prompt });
  }

  if (parsed.name && (typeof parsed.personality === "string" || typeof parsed.first_mes === "string" || typeof parsed.description === "string")) {
    return withDefaults({
      name: parsed.name,
      description: parsed.description || "",
      prompt: parsed.personality || "",
      scenario: parsed.scenario || "",
      first_mes: parsed.first_mes || "",
      mes_example: parsed.mes_example || "",
      tags: parsed.tags || [],
    });
  }

  throw new Error("Unrecognized character file format.");
};

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
