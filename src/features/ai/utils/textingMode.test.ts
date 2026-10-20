import { receiptFor, revealDelayMs, splitIntoTexts } from "./textingMode";

describe("splitIntoTexts", () => {
  it("splits on paragraphs", () => {
    expect(splitIntoTexts("Hey!\n\n*waves* How was work?\n\nMissed you.")).toEqual(["Hey!", "*waves* How was work?", "Missed you."]);
  });

  it("splits a single block written line by line", () => {
    expect(splitIntoTexts("omg\nyou won't believe this\nCALL ME")).toEqual(["omg", "you won't believe this", "CALL ME"]);
  });

  it("keeps a list in one bubble", () => {
    expect(splitIntoTexts("- milk\n- eggs\n- bread")).toEqual(["- milk\n- eggs\n- bread"]);
  });

  it("caps the number of bubbles, keeping the rest in the last", () => {
    const parts = splitIntoTexts(Array.from({ length: 9 }, (_, i) => `line ${i + 1}`).join("\n\n"));
    expect(parts).toHaveLength(6);
    expect(parts[5]).toBe("line 6\n\nline 7\n\nline 8\n\nline 9");
  });

  it("returns nothing for empty text", () => {
    expect(splitIntoTexts("  ")).toEqual([]);
  });
});

describe("revealDelayMs", () => {
  it("scales with length within bounds", () => {
    expect(revealDelayMs("hi")).toBe(700);
    expect(revealDelayMs("a".repeat(40))).toBe(1520);
    expect(revealDelayMs("a".repeat(500))).toBe(2800);
  });
});

describe("receiptFor", () => {
  it("marks messages before the last reply, or the one being answered, as read", () => {
    expect(receiptFor(1, 2, 3, false)).toBe("read");
    expect(receiptFor(3, 2, 3, false)).toBe("sent");
    expect(receiptFor(3, 2, 3, true)).toBe("read");
  });
});
