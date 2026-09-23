import { matchLoreEntries, buildWorldInfoSection } from "./loreUtils";
import { LoreEntry, Message } from "../../../types";

const msg = (txt: string): Message => ({ role: "you", txt });

const entry = (partial: Partial<LoreEntry> & { id: string }): LoreEntry => ({
  keywords: [],
  content: "",
  ...partial,
});

describe("matchLoreEntries", () => {
  it("returns nothing when there are no entries", () => {
    expect(matchLoreEntries(undefined, [msg("hello")])).toEqual([]);
    expect(matchLoreEntries([], [msg("hello")])).toEqual([]);
  });

  it("matches an entry whose keyword appears in a recent message, case-insensitively", () => {
    const e = entry({ id: "1", keywords: ["Silver Court"], content: "The Silver Court is a hidden fae kingdom." });
    const result = matchLoreEntries([e], [msg("Tell me about the silver court")]);
    expect(result).toEqual([e]);
  });

  it("does not match when no keyword appears", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "Dragons are extinct." });
    expect(matchLoreEntries([e], [msg("Let's talk about cats")])).toEqual([]);
  });

  it("matches if any of an entry's several keywords hits", () => {
    const e = entry({ id: "1", keywords: ["foo", "bar"], content: "lore" });
    expect(matchLoreEntries([e], [msg("I said bar")])).toEqual([e]);
  });

  it("skips disabled entries even if their keyword matches", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "lore", enabled: false });
    expect(matchLoreEntries([e], [msg("a dragon appears")])).toEqual([]);
  });

  it("skips entries with empty content", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "   " });
    expect(matchLoreEntries([e], [msg("a dragon appears")])).toEqual([]);
  });

  it("only scans the most recent LORE_SCAN_MESSAGE_COUNT messages", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "lore" });
    const oldMessages = Array.from({ length: 15 }, (_, i) => msg(`filler ${i}`));
    const messages = [msg("a dragon appears"), ...oldMessages];
    expect(matchLoreEntries([e], messages)).toEqual([]);
  });

  it("ignores blank/whitespace-only keywords", () => {
    const e = entry({ id: "1", keywords: ["   ", ""], content: "lore" });
    expect(matchLoreEntries([e], [msg("anything at all")])).toEqual([]);
  });
});

describe("matchLoreEntries matching rules", () => {
  it("matches whole words only, so a keyword inside another word doesn't fire", () => {
    const e = entry({ id: "1", keywords: ["cat"], content: "lore" });
    expect(matchLoreEntries([e], [msg("What category is this?")])).toEqual([]);
    expect(matchLoreEntries([e], [msg("The cat, again.")])).toEqual([e]);
  });

  it("handles keywords with punctuation and non-ASCII letters", () => {
    const a = entry({ id: "1", keywords: ["Mr. Vance"], content: "a" });
    const b = entry({ id: "2", keywords: ["Zoë"], content: "b" });
    expect(matchLoreEntries([a, b], [msg("I met Mr. Vance and Zoë.")])).toEqual([a, b]);
    expect(matchLoreEntries([b], [msg("Zoëlle waved.")])).toEqual([]);
  });

  it("always includes constant entries, first, even with no keyword match", () => {
    const keyed = entry({ id: "1", keywords: ["dragon"], content: "Dragons." });
    const constant = entry({ id: "2", keywords: [], content: "The world is flat.", constant: true });
    expect(matchLoreEntries([keyed, constant], [msg("hello")])).toEqual([constant]);
    expect(matchLoreEntries([keyed, constant], [msg("a dragon")])).toEqual([constant, keyed]);
  });

  it("pulls in entries named by other triggered entries", () => {
    const court = entry({ id: "1", keywords: ["Silver Court"], content: "The Silver Court is ruled by Queen Maeve." });
    const maeve = entry({ id: "2", keywords: ["Maeve"], content: "Maeve is ancient." });
    expect(matchLoreEntries([court, maeve], [msg("Tell me of the Silver Court")])).toEqual([court, maeve]);
  });

  it("stops adding matches once the character budget is used up, but always keeps the first", () => {
    const big = entry({ id: "1", keywords: ["a"], content: "x".repeat(5000) });
    const second = entry({ id: "2", keywords: ["b"], content: "y".repeat(2000) });
    const small = entry({ id: "3", keywords: ["c"], content: "z" });
    expect(matchLoreEntries([big, second, small], [msg("a b c")])).toEqual([big, small]);
  });
});

describe("buildWorldInfoSection", () => {
  it("joins matched entries under a [World Info] header", () => {
    const entries = [
      entry({ id: "1", content: "First fact." }),
      entry({ id: "2", content: "Second fact." }),
    ];
    const section = buildWorldInfoSection(entries);
    expect(section).toBe("[World Info]\nFirst fact.\n\nSecond fact.");
  });
});
