import { parseCharacterCardJson, parseCharacterCardText, characterToCardV2 } from "./characterCard";
import { Character } from "../../types";

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

describe("characterToCardV2", () => {
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
      { id: 0, keys: ["hell"], content: "Escaped Avernus.", enabled: true, insertion_order: 0, extensions: {} },
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
