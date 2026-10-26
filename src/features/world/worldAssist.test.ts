import { buildCastSuggestionsPrompt, buildWorldFieldPrompt, buildWorldFillPrompt, cleanFieldSuggestion, parseCastSuggestions, parseWorldFill } from "./worldAssist";

describe("AI help for worlds", () => {
  it("asks for one field with what's known, and cleans the answer", () => {
    const p = buildWorldFieldPrompt("tone", { name: "Harbour Town", premise: "A rainy port." }, [{ name: "Aria", description: "mechanic" }]);
    expect(p).toContain("Name: Harbour Town");
    expect(p).toContain("Aria (mechanic)");
    expect(p).toContain("its tone");
    expect(cleanFieldSuggestion('Tone: "Cozy small-town drama"')).toBe("Cozy small-town drama");
  });

  it("fills only what's missing, reading loose JSON", () => {
    const p = buildWorldFillPrompt({ name: "Harbour Town" });
    expect(p).toContain('"premise"');
    expect(p).not.toContain('"name": "..."');
    expect(parseWorldFill('Sure:\n```json\n{"Premise": "A rainy port.", "Background": "Old docks.", "tone": "Cozy",}\n```')).toEqual({ premise: "A rainy port.", details: "Old docks.", tone: "Cozy" });
  });

  it("suggests new people tied to the cast, skipping ones already there", () => {
    const cast = [{ name: "Aria Vega", description: "mechanic" }];
    expect(buildCastSuggestionsPrompt({ name: "Harbour Town" }, cast, ["Lena"])).toContain("Not these, and not like them: Lena");
    const reply = '[{"name": "Tomas Vega", "idea": "Aria\'s older brother, a ferry pilot", "tieWith": "Aria", "tie": "your older brother"}, {"name": "aria vega", "idea": "dup"}, {"name": "Mara", "idea": "barista", "tieWith": "Nobody", "tie": "friend"}]';
    expect(parseCastSuggestions(reply, cast)).toEqual([
      { name: "Tomas Vega", idea: "Aria's older brother, a ferry pilot", tieWith: "Aria Vega", tie: "older brother" },
      { name: "Mara", idea: "barista" },
    ]);
  });
});

describe("suggestions know who's selected (the user's report, 2026-10-26)", () => {
  const { castLiteOf, buildCastSuggestionsPrompt } = require("./worldAssist");
  test("someone with no description is described from their prompt and traits", () => {
    expect(castLiteOf({ name: "Aria", prompt: "You are Aria, a lighthouse keeper.", personalityTraits: ["shy"], relationship: "Friend" })).toEqual({ name: "Aria", description: "Traits: shy You are Aria, a lighthouse keeper.", relationship: "Friend" });
  });
  test("with people selected, each suggestion is tied to one of them", () => {
    const prompt = buildCastSuggestionsPrompt({ name: "Harbour" }, [castLiteOf({ name: "Aria", prompt: "A lighthouse keeper." })], ["Bram"]);
    expect(prompt).toContain("- Aria: A lighthouse keeper.");
    expect(prompt).toContain("each one tied to someone listed above by name");
    expect(prompt).toContain("Not these, and not like them: Bram.");
  });
});
