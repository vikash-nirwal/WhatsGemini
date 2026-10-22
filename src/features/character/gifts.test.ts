import { Gift } from "../../types";
import { buildGiftBackPrompt, buildGiftsSection, giftMessage, giftPhrase, parseGiftBack } from "./gifts";

const gift = (what: string, from: Gift["from"], at = new Date(2026, 9, 22).getTime()): Gift => ({ id: what, what, at, from });

describe("gifts", () => {
  it("reads a gift mid-sentence without lowercasing names", () => {
    expect(giftPhrase("Two concert tickets.")).toBe("two concert tickets");
    expect(giftPhrase("Paris snow globe")).toBe("Paris snow globe");
    expect(giftMessage("Flowers")).toBe("*gives you flowers*");
  });

  it("lists recent gifts both ways for the prompt", () => {
    const section = buildGiftsSection([gift("A good book", "you"), gift("a knitted scarf", "character")], "Aria", "Sam")!;
    expect(section).toContain("Gifts between you (Aria) and Sam:");
    expect(section).toContain("- Sam gave you a good book (Oct 22)");
    expect(section).toContain("- You gave Sam a knitted scarf (Oct 22)");
    expect(buildGiftsSection([], "Aria", "Sam")).toBeUndefined();
  });

  it("keeps only the latest eight in the prompt", () => {
    const many = Array.from({ length: 10 }, (_, i) => gift(`Gift ${i}`, "you"));
    const section = buildGiftsSection(many, "Aria", "Sam")!;
    expect(section).not.toContain("Gift 1 ");
    expect(section).toContain("Gift 9");
  });

  it("asks for a gift back and reads a short answer", () => {
    const prompt = buildGiftBackPrompt("Aria", "Sam", "your birthday", ["Sam loves astronomy"], [gift("Flowers", "you")]);
    expect(prompt).toContain("for your birthday");
    expect(prompt).toContain("Sam loves astronomy");
    expect(prompt).toContain("Gifts Sam has given Aria: flowers.");
    expect(parseGiftBack('"A star map of the night we met."\n')).toBe("A star map of the night we met");
    expect(parseGiftBack("")).toBeUndefined();
  });
});
