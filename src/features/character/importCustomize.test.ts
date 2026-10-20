import { parseImportCustomizeResponse, pickCustomizeFields, applyCustomizeFields, buildImportCustomizePrompt } from "./importCustomize";
import { LoreEntry } from "../../types";
import { ParsedCharacterCard } from "./characterCard";

describe("parseImportCustomizeResponse", () => {
  it("parses a clean JSON object", () => {
    const text = JSON.stringify({
      name: "Mira",
      description: "A rogue.",
      prompt: "Sly and quick.",
      scenario: "",
      first_mes: "",
      mes_example: "",
      tags: ["Fantasy"],
      relationship: "",
      appearance: "",
      loreEntries: [{ keywords: ["tavern"], content: "The tavern is loud.", enabled: true }],
    });
    const fields = parseImportCustomizeResponse(text);
    expect(fields.name).toBe("Mira");
    expect(fields.tags).toEqual(["Fantasy"]);
    expect(fields.loreEntries).toHaveLength(1);
    expect(fields.loreEntries[0].content).toBe("The tavern is loud.");
    expect(fields.loreEntries[0].id).toBeTruthy();
  });

  // Models frequently ignore "no markdown fences" and wrap the JSON in a
  // ```json code block anyway - this should still parse instead of erroring.
  it("strips a ```json fence around the object", () => {
    const text = "```json\n" + JSON.stringify({ name: "Mira", description: "", prompt: "", scenario: "", first_mes: "", mes_example: "", tags: [], relationship: "", appearance: "", loreEntries: [] }) + "\n```";
    expect(parseImportCustomizeResponse(text).name).toBe("Mira");
  });

  it("throws a friendly error on unparseable text", () => {
    expect(() => parseImportCustomizeResponse("Sure, here's what I changed: nothing.")).toThrow(/wasn't valid JSON/);
  });

  // The most common real-world failure: the model pastes a literal newline
  // inside a multi-line field (prompt/mes_example) instead of escaping it as
  // \n, which strict JSON.parse rejects as a bad control character.
  it("repairs a literal newline inside a string field", () => {
    const text = `{
  "name": "Mira",
  "description": "A rogue.",
  "prompt": "Sarcastic and quick.\nAlways ready with a quip.",
  "scenario": "",
  "first_mes": "",
  "mes_example": "User: hi\nMira: hey",
  "tags": [],
  "relationship": "",
  "appearance": "",
  "loreEntries": []
}`;
    const fields = parseImportCustomizeResponse(text);
    expect(fields.prompt).toBe("Sarcastic and quick.\nAlways ready with a quip.");
    expect(fields.mes_example).toBe("User: hi\nMira: hey");
  });

  it("repairs a trailing comma before a closing brace/bracket", () => {
    const text = `{
  "name": "Mira",
  "description": "",
  "prompt": "",
  "scenario": "",
  "first_mes": "",
  "mes_example": "",
  "tags": ["Fantasy",],
  "relationship": "",
  "appearance": "",
  "loreEntries": [],
}`;
    const fields = parseImportCustomizeResponse(text);
    expect(fields.name).toBe("Mira");
    expect(fields.tags).toEqual(["Fantasy"]);
  });

  it("defaults missing/malformed fields instead of throwing", () => {
    const fields = parseImportCustomizeResponse(JSON.stringify({ name: "Mira" }));
    expect(fields.description).toBe("");
    expect(fields.tags).toEqual([]);
    expect(fields.loreEntries).toEqual([]);
  });
});

describe("pickCustomizeFields / applyCustomizeFields", () => {
  it("round-trips without disturbing fields the dialog doesn't show", () => {
    const card: ParsedCharacterCard = {
      name: "Mira",
      description: "A rogue.",
      prompt: "Sly.",
      tags: [],
      scenario: "",
      first_mes: "",
      mes_example: "",
      relationship: "",
      appearance: "",
      appearanceImages: ["data:image/png;base64,abc"],
      accent: ["#111111", "#222222"],
    };
    const fields = pickCustomizeFields(card);
    fields.name = "Mira the Bold";
    const result = applyCustomizeFields(card, fields);
    expect(result.name).toBe("Mira the Bold");
    expect(result.appearanceImages).toEqual(["data:image/png;base64,abc"]);
    expect(result.accent).toEqual(["#111111", "#222222"]);
  });
});

describe("lore trigger settings through a customize pass", () => {
  const advanced: LoreEntry = {
    id: "a", keywords: ["sword"], content: "Old.", enabled: true, constant: true,
    priority: 5, selective: true, secondaryKeywords: ["fire"], sticky: 2, scanDepth: 4, probability: 30,
  };
  const plain: LoreEntry = { id: "b", keywords: ["k"], content: "Plain.", enabled: true };
  const previous = { ...pickCustomizeFields({ name: "Mira", prompt: "Sly." } as ParsedCharacterCard), loreEntries: [advanced, plain] };
  const reply = (loreEntries: unknown[]) => JSON.stringify({ name: "Mira", loreEntries });

  it("leaves the trigger settings out of the prompt", () => {
    const prompt = buildImportCustomizePrompt(previous, "make it darker");
    expect(prompt).toContain('"id": "a"');
    expect(prompt).not.toContain("secondaryKeywords");
    expect(prompt).not.toContain("probability");
  });

  it("keeps an entry's settings when the model echoes its id", () => {
    const fields = parseImportCustomizeResponse(reply([
      { id: "b", keywords: ["k"], content: "New plain.", enabled: true },
      { id: "a", keywords: ["blade"], content: "New.", enabled: true },
    ]), previous);
    expect(fields.loreEntries).toEqual([
      { ...plain, content: "New plain." },
      { ...advanced, keywords: ["blade"], content: "New." },
    ]);
  });

  it("falls back to position when the ids are dropped but the count matches", () => {
    const fields = parseImportCustomizeResponse(reply([
      { keywords: ["sword"], content: "New.", enabled: true },
      { keywords: ["k"], content: "Plain.", enabled: false },
    ]), previous);
    expect(fields.loreEntries[0]).toEqual({ ...advanced, content: "New." });
    expect(fields.loreEntries[1]).toEqual({ ...plain, enabled: false });
  });

  it("gives new entries a fresh id and no settings, and never reuses an id twice", () => {
    const fields = parseImportCustomizeResponse(reply([
      { id: "a", keywords: ["sword"], content: "One.", enabled: true },
      { id: "a", keywords: ["sword"], content: "Two.", enabled: true },
      { id: "", keywords: ["new"], content: "Three.", enabled: true },
    ]), previous);
    expect(fields.loreEntries[0]).toMatchObject({ id: "a", priority: 5 });
    expect(fields.loreEntries[1].id).not.toBe("a");
    expect(fields.loreEntries[1].priority).toBeUndefined();
    expect(fields.loreEntries[2]).toEqual({ id: fields.loreEntries[2].id, keywords: ["new"], content: "Three.", enabled: true });
  });
});
