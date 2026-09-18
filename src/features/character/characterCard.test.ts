import { parseCharacterCardJson, parseCharacterCardText } from "./characterCard";

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
});

describe("parseCharacterCardText", () => {
  it("strips a leading UTF-8 BOM before parsing", () => {
    const json = JSON.stringify({ name: "Mira", prompt: "Sly and quick." });
    expect(parseCharacterCardText("﻿" + json).name).toBe("Mira");
  });
});
