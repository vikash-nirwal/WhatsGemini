import { detectMinorIndicators, effectiveContentRating } from "./contentRating";
import { Character } from "../../types";

const char = (overrides: Partial<Character>): Character => ({ id: 1, name: "Mira", description: "", prompt: "Sly.", ...overrides });

describe("detectMinorIndicators", () => {
  it.each([
    "She is 16 years old.",
    "a 15-year-old girl",
    "Age: 14",
    "He's 17yo",
    "a high school student",
    "a middle schooler",
    "an underage runaway",
    "loli",
    "She is still a minor.",
    "a little girl",
  ])("flags %p", (text) => {
    expect(detectMinorIndicators([text]).length).toBeGreaterThan(0);
  });

  it.each([
    "She is 24 years old.",
    "Age: 19",
    "a 30-year-old mercenary",
    "She remembers her childhood fondly.",
    "a minor injury",
    "a college student",
  ])("does not flag %p", (text) => {
    expect(detectMinorIndicators([text])).toEqual([]);
  });
});

describe("effectiveContentRating", () => {
  it("is undefined for an unrated, untagged character", () => {
    expect(effectiveContentRating(char({}))).toBeUndefined();
  });

  it("needs the 18+ confirmation before NSFW applies", () => {
    expect(effectiveContentRating(char({ contentRating: "nsfw" }))).toBe("sfw");
    expect(effectiveContentRating(char({ tags: ["NSFW"] }))).toBe("sfw");
    expect(effectiveContentRating(char({ contentRating: "nsfw", adultsConfirmed: true }))).toBe("nsfw");
  });

  it("holds a confirmed NSFW card to SFW if its text indicates a minor", () => {
    expect(effectiveContentRating(char({ contentRating: "nsfw", adultsConfirmed: true, description: "A 16-year-old." }))).toBe("sfw");
  });
});
