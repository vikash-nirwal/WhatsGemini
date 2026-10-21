import { buildAvoidNote, findRepeatedOpening, findRepeatedPhrases } from "./antiRepetition";

describe("findRepeatedPhrases", () => {
  it("finds a phrase reused across replies, longest form only", () => {
    const replies = [
      "*She smiles softly, a hint of mischief in her eyes.* Hello there.",
      "Oh really? *a hint of mischief in her eyes* Tell me more.",
      "I'd love that. *She leans back, a hint of mischief in her eyes.*",
    ];
    expect(findRepeatedPhrases(replies)).toEqual(["a hint of mischief in her eyes"]);
  });

  it("ignores runs made only of filler words and short replies", () => {
    expect(findRepeatedPhrases(["it is what it is so", "and it is what it is"])).toEqual([]);
    expect(findRepeatedPhrases(["Hi.", "Hi."])).toEqual([]);
  });

  it("only looks at the last few replies", () => {
    const old = "the stars above the quiet harbour tonight";
    const replies = [old, old, "One.", "Two two two.", "Three now here.", "Four things to say.", "Five final words here."];
    expect(findRepeatedPhrases(replies)).toEqual([]);
  });
});

describe("findRepeatedOpening", () => {
  it("spots replies that start the same way", () => {
    expect(findRepeatedOpening(["*She smiles softly.* Hi", "Okay, fine.", "*She smiles softly* and nods"])).toBe("she smiles softly");
    expect(findRepeatedOpening(["One two three", "Four five six", "Seven eight nine"])).toBeUndefined();
  });
});

describe("buildAvoidNote", () => {
  it("lists the phrases and the opening, or nothing", () => {
    expect(buildAvoidNote(["a hint of mischief"], "she smiles softly")).toBe(
      'Your recent replies keep reusing these phrases; don\'t use them in this reply, and say it differently: "a hint of mischief". Several replies started with "she smiles softly"; open this one differently.'
    );
    expect(buildAvoidNote([])).toBeUndefined();
  });
});

describe("long repeats", () => {
  it("come back as one phrase, not overlapping pieces", () => {
    const replies = ["*She tucks a strand of hair behind her ear.* Hey!", "Not much. *She tucks a strand of hair behind her ear.*"];
    expect(findRepeatedPhrases(replies)).toEqual(["she tucks a strand of hair behind her ear"]);
  });
});
