import { matchLoreEntries } from "../ai/utils/loreUtils";
import { parseCharacterCardJson, parseCharacterCardText, characterToCardV2 } from "./characterCard";
import { Character, LoreEntry } from "../../types";

describe("parseCharacterCardJson", () => {
  it("uses `personality` as prompt when present", () => {
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { name: "Mira", description: "A rogue.", personality: "Sly and quick.", system_prompt: "" },
    };
    expect(parseCharacterCardJson(card).prompt).toBe("Sly and quick.");
  });

  it("falls back to `system_prompt` when `personality` is blank", () => {
    const card = {
      spec: "chara_card_v3",
      data: { name: "Mira", description: "A rogue.", personality: "", system_prompt: "Act as a sly rogue." },
    };
    expect(parseCharacterCardJson(card).prompt).toBe("Act as a sly rogue.");
  });

  // Reproduces a chub.ai-style export (e.g. many NSFW character cards) that
  // leaves both `personality` and `system_prompt` blank and puts the whole
  // persona in `description` instead - this used to import with an empty
  // `prompt`, which addCharacter's "name and prompt are required" check
  // then rejected.
  it("falls back to `description` when both `personality` and `system_prompt` are blank", () => {
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { name: "Karlach", description: "A tiefling barbarian fresh out of hell.", personality: "", system_prompt: "" },
    };
    const parsed = parseCharacterCardJson(card);
    expect(parsed.prompt).toBe("A tiefling barbarian fresh out of hell.");
    expect(parsed.description).toBe("A tiefling barbarian fresh out of hell.");
  });

  it("applies the same description fallback to flat/legacy V1 cards", () => {
    const card = { name: "Karlach", description: "A tiefling barbarian.", personality: "", first_mes: "Hey, soldier." };
    expect(parseCharacterCardJson(card).prompt).toBe("A tiefling barbarian.");
  });

  it("throws when a V2/V3 card has no name", () => {
    const card = { spec: "chara_card_v2", spec_version: "2.0", data: { description: "No name here." } };
    expect(() => parseCharacterCardJson(card)).toThrow("missing name");
  });

  it("throws on an unrecognized shape", () => {
    expect(() => parseCharacterCardJson({ foo: "bar" })).toThrow("Unrecognized character file format.");
  });

  // chub.ai/SillyTavern cards carry their lorebook in the spec-standard
  // `character_book.entries` field (using `keys`, not our `keywords`) -
  // this used to be silently dropped on import.
  it("imports a chub.ai-style `character_book` as loreEntries", () => {
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Karlach",
        description: "A tiefling barbarian.",
        personality: "Fierce and warm-hearted.",
        character_book: {
          entries: [
            { keys: ["hell", "engine"], content: "Karlach escaped Avernus with an infernal engine for a heart.", enabled: true },
            { keys: ["Wyll"], content: "Karlach has a soft spot for Wyll.", enabled: false },
          ],
        },
      },
    };
    const parsed = parseCharacterCardJson(card);
    expect(parsed.loreEntries).toHaveLength(2);
    expect(parsed.loreEntries?.[0].keywords).toEqual(["hell", "engine"]);
    expect(parsed.loreEntries?.[0].content).toBe("Karlach escaped Avernus with an infernal engine for a heart.");
    expect(parsed.loreEntries?.[0].enabled).toBe(true);
    expect(parsed.loreEntries?.[1].enabled).toBe(false);
    // Every entry needs its own id even though the spec's own `id` is optional.
    expect(new Set(parsed.loreEntries?.map((e) => e.id)).size).toBe(2);
  });

  it("prefers the whatsgemini extension's loreEntries over character_book when both are present", () => {
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Karlach",
        personality: "Fierce.",
        extensions: { whatsgemini: { loreEntries: [{ id: "native-1", keywords: ["native"], content: "Native lore.", enabled: true }] } },
        character_book: { entries: [{ keys: ["book"], content: "Book lore.", enabled: true }] },
      },
    };
    const parsed = parseCharacterCardJson(card);
    expect(parsed.loreEntries).toEqual([{ id: "native-1", keywords: ["native"], content: "Native lore.", enabled: true }]);
  });
});

describe("parseCharacterCardJson card fields", () => {
  it("imports alternate greetings, post-history instructions and creator notes", () => {
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Mira",
        personality: "Sly.",
        first_mes: "Hello.",
        alternate_greetings: ["Hey there.", "  ", "Well, well."],
        post_history_instructions: "Stay in character.",
        creator_notes: "Works best with Gemini.",
      },
    };
    const parsed = parseCharacterCardJson(card);
    expect(parsed.alternateGreetings).toEqual(["Hey there.", "Well, well."]);
    expect(parsed.postHistoryInstructions).toBe("Stay in character.");
    expect(parsed.creatorNotes).toBe("Works best with Gemini.");
  });

  it("keeps system_prompt alongside personality instead of dropping it, minus {{original}}", () => {
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { name: "Mira", personality: "Sly and quick.", system_prompt: "{{original}} Write in third person." },
    };
    expect(parseCharacterCardJson(card).prompt).toBe("Write in third person.\n\nSly and quick.");
  });

  it("imports a character_book entry's constant flag", () => {
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { name: "Mira", personality: "Sly.", character_book: { entries: [{ keys: [], content: "Always true.", enabled: true, constant: true }] } },
    };
    expect(parseCharacterCardJson(card).loreEntries?.[0].constant).toBe(true);
  });
});

describe("content rating on import", () => {
  it("marks an NSFW-tagged card NSFW but never imports the 18+ confirmation", () => {
    const card = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Mira", personality: "Sly.", tags: ["nsfw"] } };
    const parsed = parseCharacterCardJson(card);
    expect(parsed.contentRating).toBe("nsfw");
    expect(parsed.adultsConfirmed).toBeUndefined();
  });

  it("drops a confirmation carried in a native export file", () => {
    const parsed = parseCharacterCardJson({ name: "Mira", prompt: "Sly.", contentRating: "nsfw", adultsConfirmed: true });
    expect(parsed.adultsConfirmed).toBeUndefined();
  });
});

describe("characterToCardV2", () => {
  it("exports alternate greetings and post-history instructions", () => {
    const char = { id: 1, name: "Mira", description: "", prompt: "Sly.", alternateGreetings: ["Hey."], postHistoryInstructions: "Be brief." } as Character;
    const card = characterToCardV2(char);
    expect(card.data.alternate_greetings).toEqual(["Hey."]);
    expect(card.data.post_history_instructions).toBe("Be brief.");
  });

  it("exports loreEntries as a standard character_book so other apps can read them", () => {
    const char: Character = {
      id: 1,
      name: "Karlach",
      description: "A tiefling barbarian.",
      prompt: "Fierce and warm-hearted.",
      loreEntries: [{ id: "lore-1", keywords: ["hell"], content: "Escaped Avernus.", enabled: true }],
    } as Character;
    const card = characterToCardV2(char);
    expect(card.data.character_book?.entries).toEqual([
      { id: 0, keys: ["hell"], content: "Escaped Avernus.", enabled: true, constant: false, insertion_order: 0, extensions: {} },
    ]);
  });

  it("omits character_book when there are no loreEntries", () => {
    const char: Character = { id: 1, name: "Karlach", description: "", prompt: "Fierce." } as Character;
    expect(characterToCardV2(char).data.character_book).toBeUndefined();
  });
});

describe("parseCharacterCardText", () => {
  it("strips a leading UTF-8 BOM before parsing", () => {
    const json = JSON.stringify({ name: "Mira", prompt: "Sly and quick." });
    expect(parseCharacterCardText("﻿" + json).name).toBe("Mira");
  });
});

// Advanced lorebook triggers (#29), as SillyTavern writes them into
// character_book (its convertWorldInfoToCharacterBook shape).
describe("character_book advanced trigger fields", () => {
  const cardWith = (entries: unknown[]) => ({
    spec: "chara_card_v2",
    data: { name: "Mira", personality: "Sly.", character_book: { entries } },
  });
  const stEntry = (over: Record<string, unknown> = {}, ext: Record<string, unknown> = {}) => ({
    keys: ["sword"],
    secondary_keys: [],
    content: "lore",
    enabled: true,
    constant: false,
    selective: true,
    insertion_order: 100,
    extensions: { position: 0, depth: 4, probability: 100, useProbability: true, selectiveLogic: 0, scan_depth: null, sticky: null, ...ext },
    ...over,
  });
  const importOne = (entry: unknown, others: unknown[] = []) =>
    parseCharacterCardJson(cardWith([entry, ...others])).loreEntries![0];

  it("imports a default SillyTavern entry as a plain entry", () => {
    const e = importOne(stEntry());
    expect(e).toEqual({ id: e.id, keywords: ["sword"], content: "lore", enabled: true });
  });

  it("imports secondary keys with selective and its logic", () => {
    const e = importOne(stEntry({ secondary_keys: ["fire"] }, { selectiveLogic: 2 }));
    expect(e).toMatchObject({ secondaryKeywords: ["fire"], selective: true, secondaryLogic: "notAny" });
    expect(importOne(stEntry({ secondary_keys: ["fire"] }, { selectiveLogic: 1 })).secondaryLogic).toBe("notAll");
    expect(importOne(stEntry({ secondary_keys: ["fire"] }, { selectiveLogic: 3 })).secondaryLogic).toBe("andAll");
    expect(importOne(stEntry({ secondary_keys: ["fire"] })).secondaryLogic).toBeUndefined();
  });

  it("keeps secondary keys but not selective when the card turned selective off", () => {
    const e = importOne(stEntry({ secondary_keys: ["fire"], selective: false }));
    expect(e.secondaryKeywords).toEqual(["fire"]);
    expect(e.selective).toBeUndefined();
  });

  it("imports scan depth from scan_depth, not from the insertion depth", () => {
    expect(importOne(stEntry({}, { scan_depth: 3 })).scanDepth).toBe(3);
    expect(importOne(stEntry({}, { depth: 8 })).scanDepth).toBeUndefined();
  });

  it("imports sticky", () => {
    expect(importOne(stEntry({}, { sticky: 5 })).sticky).toBe(5);
    expect(importOne(stEntry({}, { sticky: 0 })).sticky).toBeUndefined();
  });

  it("imports probability unless useProbability is off", () => {
    expect(importOne(stEntry({}, { probability: 25 })).probability).toBe(25);
    expect(importOne(stEntry({}, { probability: 0 })).probability).toBe(0);
    expect(importOne(stEntry({}, { probability: 25, useProbability: false })).probability).toBeUndefined();
    expect(importOne(stEntry({}, { probability: 25, useProbability: undefined })).probability).toBe(25);
  });

  it("imports priority from priority, else insertion_order, and drops it when all entries share one", () => {
    expect(importOne(stEntry({ insertion_order: 200 }), [stEntry()]).priority).toBe(200);
    expect(importOne(stEntry({ insertion_order: 1, priority: 50 }), [stEntry({ priority: 10 })]).priority).toBe(50);
    expect(importOne(stEntry(), [stEntry()]).priority).toBeUndefined();
  });

  it("ignores malformed values", () => {
    const e = importOne(stEntry({ keys: ["ok", 3], secondary_keys: "fire", extensions: "nope" }));
    expect(e).toEqual({ id: e.id, keywords: ["ok"], content: "lore", enabled: true });
  });

  it("makes an imported card trigger the way its author set it up", () => {
    const e = importOne(stEntry({ secondary_keys: ["fire"] }));
    expect(matchLoreEntries([e], [{ role: "you", txt: "my sword" }])).toEqual([]);
    expect(matchLoreEntries([e], [{ role: "you", txt: "my sword of fire" }])).toEqual([e]);
  });

  const advanced: LoreEntry = {
    id: "lore-1",
    keywords: ["sword"],
    content: "Forged in fire.",
    enabled: true,
    priority: 7,
    selective: true,
    secondaryKeywords: ["fire"],
    secondaryLogic: "andAll",
    sticky: 2,
    scanDepth: 4,
    probability: 40,
  };
  const charWith = (loreEntries: LoreEntry[]) => ({ id: 1, name: "Mira", description: "", prompt: "Sly.", loreEntries } as Character);

  it("exports the advanced fields where SillyTavern reads them", () => {
    const [out] = characterToCardV2(charWith([advanced])).data.character_book!.entries;
    expect(out).toEqual({
      id: 0,
      keys: ["sword"],
      secondary_keys: ["fire"],
      content: "Forged in fire.",
      enabled: true,
      constant: false,
      selective: true,
      insertion_order: 7,
      priority: 7,
      extensions: { selectiveLogic: 3, scan_depth: 4, sticky: 2, probability: 40, useProbability: true },
    });
  });

  it("writes priorities into insertion_order for every entry once any entry has one", () => {
    const plain: LoreEntry = { id: "lore-2", keywords: ["k"], content: "plain" };
    const entries = characterToCardV2(charWith([plain, advanced])).data.character_book!.entries;
    expect(entries.map((e) => e.insertion_order)).toEqual([0, 7]);
    expect(entries[0].priority).toBeUndefined();
  });

  it("round-trips through character_book alone", () => {
    const plain: LoreEntry = { id: "lore-2", keywords: ["k"], content: "plain", enabled: false, constant: true };
    const card = characterToCardV2(charWith([advanced, plain]));
    delete card.data.extensions.whatsgemini;
    const back = parseCharacterCardJson(JSON.parse(JSON.stringify(card))).loreEntries!;
    expect(back[0]).toEqual({ ...advanced, id: back[0].id, constant: undefined });
    expect(back[1]).toEqual({ ...plain, id: back[1].id, priority: 0 });
  });

  it("round-trips losslessly through the whatsgemini extension", () => {
    const card = characterToCardV2(charWith([advanced]));
    expect(parseCharacterCardJson(JSON.parse(JSON.stringify(card))).loreEntries).toEqual([advanced]);
  });
});
