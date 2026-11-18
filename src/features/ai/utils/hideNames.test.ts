import { guessKind, kindLookup, nameLabels, namesIn, withoutNames } from "./hideNames";

test("one person drawn is just the character", () => {
  const labels = nameLabels(["Aria Vale"]);
  expect(withoutNames("Character portrait of Aria Vale. Aria's red scarf; aria smiles.", labels)).toBe("Character portrait of the character. The character's red scarf; the character smiles.");
});

test("several people get numbered labels in reference order", () => {
  const labels = nameLabels(["Aria", "Kai", "Aria", undefined]);
  expect(Array.from(labels.values())).toEqual(["person 1", "person 2"]);
  expect(withoutNames("Aria hugs Kai at the harbour", labels)).toBe("Person 1 hugs person 2 at the harbour");
});

test("only whole words are replaced", () => {
  const labels = nameLabels(["Kai"]);
  expect(withoutNames("Kaiser rolls; Kai, smiling", labels)).toBe("Kaiser rolls; the character, smiling");
});

test("a LoRA trigger word that contains the name is left alone", () => {
  expect(withoutNames("aria_char, Aria waving", nameLabels(["Aria"]))).toBe("aria_char, the character waving");
});

test("only the names the prompt mentions are found, first names included", () => {
  expect(namesIn("Aria hugs Vikash at the harbour", ["Kai Moss", "Vikash Nirwal", undefined, ""])).toEqual(["Vikash Nirwal"]);
  expect(namesIn("a quiet harbour", ["Kai"])).toEqual([]);
});

// The prompt writer gets "the woman", "the man" (2026-11-18).
describe("labels by what someone is", () => {
  const kindOf = kindLookup([
    { name: "Aria Vale", look: "a young woman with silver hair" },
    { name: "Lena", about: "She runs the bakery. Her bread is famous." },
    { name: "Kai", look: "tall man, short black hair" },
    { name: "Robin", about: "Likes boats." },
  ]);

  it("calls one woman the woman, and numbers two of a kind", () => {
    expect(withoutNames("Aria hugs Kai", nameLabels(["Aria Vale", "Kai"], kindOf))).toBe("The woman hugs the man");
    expect(Array.from(nameLabels(["Aria Vale", "Kai", "Lena"], kindOf).values())).toEqual(["the first woman", "the man", "the second woman"]);
  });

  it("calls someone it can't tell the person", () => {
    expect(nameLabels(["Robin"], kindOf).get("Robin")).toBe("the person");
    expect(nameLabels(["Nobody known"], kindOf).get("Nobody known")).toBe("the person");
  });

  it("goes by the look first and needs a clear lead", () => {
    expect(guessKind("1girl, red hair")).toBe("woman");
    expect(guessKind("", "He is kind. His smile is warm.")).toBe("man");
    expect(guessKind("a woman", "Her brother and his friend")).toBe("woman");
    expect(guessKind("", "She and he")).toBeUndefined();
  });
});
