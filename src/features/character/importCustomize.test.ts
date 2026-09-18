import { parseImportCustomizeResponse, pickCustomizeFields, applyCustomizeFields } from "./importCustomize";
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
