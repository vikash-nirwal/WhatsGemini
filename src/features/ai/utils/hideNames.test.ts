import { nameLabels, withoutNames } from "./hideNames";

test("one person drawn is just the character", () => {
  const labels = nameLabels(["Aria Vale"]);
  expect(withoutNames("Character portrait of Aria Vale. Aria's red scarf; aria smiles.", labels)).toBe("Character portrait of the character. the character's red scarf; the character smiles.");
});

test("several people get numbered labels in reference order", () => {
  const labels = nameLabels(["Aria", "Kai", "Aria", undefined]);
  expect(Array.from(labels.values())).toEqual(["person 1", "person 2"]);
  expect(withoutNames("Aria hugs Kai at the harbour", labels)).toBe("person 1 hugs person 2 at the harbour");
});

test("only whole words are replaced", () => {
  const labels = nameLabels(["Kai"]);
  expect(withoutNames("Kaiser rolls; Kai, smiling", labels)).toBe("Kaiser rolls; the character, smiling");
});

test("a LoRA trigger word that contains the name is left alone", () => {
  expect(withoutNames("aria_char, Aria waving", nameLabels(["Aria"]))).toBe("aria_char, the character waving");
});
