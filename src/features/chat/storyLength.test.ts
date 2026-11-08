import { lengthOfLimit, nextLength, STORY_LENGTHS } from "./storyLength";

describe("story lengths", () => {
  it("knows a preset by its character budget, and nothing else", () => {
    expect(lengthOfLimit(STORY_LENGTHS.short.chars)).toBe("short");
    expect(lengthOfLimit(800)).toBeUndefined();
    expect(lengthOfLimit(undefined)).toBeUndefined();
  });

  it("cycles Short, Medium, Long, starting from Short for anything else", () => {
    expect(nextLength(STORY_LENGTHS.short.chars)).toBe("medium");
    expect(nextLength(STORY_LENGTHS.long.chars)).toBe("short");
    expect(nextLength(0)).toBe("short");
  });
});
