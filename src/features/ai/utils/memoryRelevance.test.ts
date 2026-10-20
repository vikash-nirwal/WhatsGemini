import { selectRelevantFacts } from "./memoryRelevance";
import { Message } from "../../../types";

const said = (txt: string): Message => ({ role: "you", txt });

describe("selectRelevantFacts", () => {
  const facts = [
    "Arin's sister Lena lives in Lisbon.",
    "Arin is afraid of deep water.",
    "Mira promised to teach Arin the sword.",
    "Arin's favorite drink is jasmine tea.",
    "They first met at the harbor market.",
  ];

  it("sends everything while the list fits", () => {
    expect(selectRelevantFacts(facts, [], 10)).toEqual(facts);
  });

  it("prefers facts that share words with the recent conversation", () => {
    const picked = selectRelevantFacts(facts, [said("Shall we go swimming? The water looks deep today.")], 2);
    expect(picked).toContain("Arin is afraid of deep water.");
    expect(picked).toHaveLength(2);
  });

  it("matches simple word forms (promise / promised, swords / sword)", () => {
    const picked = selectRelevantFacts(facts, [said("You promise to bring the swords?")], 1);
    expect(picked).toEqual(["Mira promised to teach Arin the sword."]);
  });

  it("falls back to the newest facts when nothing came up", () => {
    expect(selectRelevantFacts(facts, [said("Hmm.")], 2)).toEqual([
      "Arin's favorite drink is jasmine tea.",
      "They first met at the harbor market.",
    ]);
  });

  it("keeps the chosen facts in their original order", () => {
    const picked = selectRelevantFacts(facts, [said("Lena called from Lisbon about the market.")], 2);
    expect(picked).toEqual(["Arin's sister Lena lives in Lisbon.", "They first met at the harbor market."]);
  });

  it("ignores common words", () => {
    const picked = selectRelevantFacts(facts, [said("the and of is to")], 1);
    expect(picked).toEqual(["They first met at the harbor market."]);
  });
});
