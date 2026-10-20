import { matchLoreEntries, buildWorldInfoSection, loreRoll, LORE_MAX_SCAN_DEPTH } from "./loreUtils";
import { LORE_SCAN_MESSAGE_COUNT } from "../../../utils/constants";
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

// Advanced trigger settings (#29). Every test also implies the default: an
// entry without the setting behaves as in the suites above.
describe("matchLoreEntries priority", () => {
  it("keeps higher-priority entries first when the budget forces a cut", () => {
    const low = entry({ id: "1", keywords: ["a"], content: "x".repeat(4000) });
    const high = entry({ id: "2", keywords: ["b"], content: "y".repeat(4000), priority: 10 });
    expect(matchLoreEntries([low, high], [msg("a b")])).toEqual([high]);
  });

  it("orders output by priority, keeping lorebook order for ties", () => {
    const a = entry({ id: "a", keywords: ["k"], content: "a" });
    const b = entry({ id: "b", keywords: ["k"], content: "b", priority: 5 });
    const c = entry({ id: "c", keywords: ["k"], content: "c" });
    const d = entry({ id: "d", keywords: ["k"], content: "d", priority: 5 });
    expect(matchLoreEntries([a, b, c, d], [msg("k")])).toEqual([b, d, a, c]);
  });

  it("treats a negative priority as below the default", () => {
    const neg = entry({ id: "1", keywords: ["k"], content: "neg", priority: -1 });
    const plain = entry({ id: "2", keywords: ["k"], content: "plain" });
    expect(matchLoreEntries([neg, plain], [msg("k")])).toEqual([plain, neg]);
  });

  it("still puts constant entries before any keyword entry, whatever its priority", () => {
    const constant = entry({ id: "1", content: "c".repeat(4000), constant: true, priority: -5 });
    const keyed = entry({ id: "2", keywords: ["k"], content: "k".repeat(4000), priority: 100 });
    expect(matchLoreEntries([keyed, constant], [msg("k")])).toEqual([constant]);
  });

  it("ignores a non-numeric priority", () => {
    const odd = entry({ id: "1", keywords: ["k"], content: "odd", priority: NaN });
    const plain = entry({ id: "2", keywords: ["k"], content: "plain" });
    expect(matchLoreEntries([odd, plain], [msg("k")])).toEqual([odd, plain]);
  });
});

describe("matchLoreEntries secondary keywords", () => {
  const selective = (partial: Partial<LoreEntry> = {}) =>
    entry({ id: "1", keywords: ["sword"], secondaryKeywords: ["fire", "ice"], selective: true, content: "lore", ...partial });

  it("fires only when a primary and a secondary keyword both match", () => {
    const e = selective();
    expect(matchLoreEntries([e], [msg("I draw my sword")])).toEqual([]);
    expect(matchLoreEntries([e], [msg("Fire and ice")])).toEqual([]);
    expect(matchLoreEntries([e], [msg("The sword bursts into fire")])).toEqual([e]);
  });

  it("matches the two lists across different messages of the same window", () => {
    const e = selective();
    expect(matchLoreEntries([e], [msg("my sword"), msg("covered in ice")])).toEqual([e]);
  });

  it("ignores secondary keywords while selective is off", () => {
    const e = selective({ selective: false });
    expect(matchLoreEntries([e], [msg("I draw my sword")])).toEqual([e]);
    expect(matchLoreEntries([e], [msg("fire")])).toEqual([]);
  });

  it("acts as primary-only when selective has no usable secondary keywords", () => {
    const e = selective({ secondaryKeywords: ["  "] });
    expect(matchLoreEntries([e], [msg("I draw my sword")])).toEqual([e]);
  });

  it("supports 'all of' secondary keywords", () => {
    const e = selective({ secondaryLogic: "andAll" });
    expect(matchLoreEntries([e], [msg("sword of fire")])).toEqual([]);
    expect(matchLoreEntries([e], [msg("sword of fire and ice")])).toEqual([e]);
  });

  it("supports 'none of' secondary keywords", () => {
    const e = selective({ secondaryLogic: "notAny" });
    expect(matchLoreEntries([e], [msg("a plain sword")])).toEqual([e]);
    expect(matchLoreEntries([e], [msg("sword of fire")])).toEqual([]);
  });

  it("supports 'not all of' secondary keywords", () => {
    const e = selective({ secondaryLogic: "notAll" });
    expect(matchLoreEntries([e], [msg("sword of fire")])).toEqual([e]);
    expect(matchLoreEntries([e], [msg("sword of fire and ice")])).toEqual([]);
  });

  it("uses whole-word matching for secondary keywords too", () => {
    const e = selective();
    expect(matchLoreEntries([e], [msg("sword, fired")])).toEqual([]);
  });

  it("applies the secondary rule to recursive matches", () => {
    const trigger = entry({ id: "t", keywords: ["forge"], content: "The forge makes a sword." });
    const e = selective({ id: "s" });
    expect(matchLoreEntries([trigger, e], [msg("the forge")])).toEqual([trigger]);
    const hot = entry({ id: "t", keywords: ["forge"], content: "The forge makes a sword in fire." });
    expect(matchLoreEntries([hot, e], [msg("the forge")])).toEqual([hot, e]);
  });
});

describe("matchLoreEntries scan depth", () => {
  const history = (first: string, fillers: number) => [msg(first), ...Array.from({ length: fillers }, (_, i) => msg(`filler ${i}`))];

  it("looks further back than the default when set higher", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "lore", scanDepth: 20 });
    expect(matchLoreEntries([e], history("a dragon appears", 15))).toEqual([e]);
  });

  it("looks only at the newest messages when set lower", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "lore", scanDepth: 1 });
    expect(matchLoreEntries([e], history("a dragon appears", 1))).toEqual([]);
    expect(matchLoreEntries([e], history("a dragon appears", 0))).toEqual([e]);
  });

  it("never fires from keywords at depth 0, but can still be pulled in by other lore", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "lore", scanDepth: 0 });
    expect(matchLoreEntries([e], [msg("dragon")])).toEqual([]);
    const lair = entry({ id: "2", keywords: ["lair"], content: "The lair of the dragon." });
    expect(matchLoreEntries([lair, e], [msg("the lair")])).toEqual([lair, e]);
  });

  it("caps very large depths at LORE_MAX_SCAN_DEPTH", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "lore", scanDepth: 1e9 });
    expect(matchLoreEntries([e], history("dragon", LORE_MAX_SCAN_DEPTH - 1))).toEqual([e]);
    expect(matchLoreEntries([e], history("dragon", LORE_MAX_SCAN_DEPTH))).toEqual([]);
  });

  it("checks each entry against its own window", () => {
    const deep = entry({ id: "1", keywords: ["dragon"], content: "deep", scanDepth: 20 });
    const shallow = entry({ id: "2", keywords: ["dragon"], content: "shallow" });
    expect(matchLoreEntries([deep, shallow], history("dragon", 12))).toEqual([deep]);
  });
});

describe("matchLoreEntries sticky", () => {
  it("stays active for N messages after the keyword leaves the scan window", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "lore", scanDepth: 1, sticky: 2 });
    expect(matchLoreEntries([e], [msg("dragon"), msg("a")])).toEqual([e]);
    expect(matchLoreEntries([e], [msg("dragon"), msg("a"), msg("b")])).toEqual([e]);
    expect(matchLoreEntries([e], [msg("dragon"), msg("a"), msg("b"), msg("c")])).toEqual([]);
  });

  it("does nothing extra when unset", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "lore", scanDepth: 1 });
    expect(matchLoreEntries([e], [msg("dragon"), msg("a")])).toEqual([]);
  });

  it("extends the default window too", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "lore", sticky: 3 });
    const fillers = (n: number) => Array.from({ length: n }, (_, i) => msg(`filler ${i}`));
    expect(matchLoreEntries([e], [msg("dragon"), ...fillers(LORE_SCAN_MESSAGE_COUNT + 2)])).toEqual([e]);
    expect(matchLoreEntries([e], [msg("dragon"), ...fillers(LORE_SCAN_MESSAGE_COUNT + 3)])).toEqual([]);
  });

  it("needs both keyword lists inside one earlier window, not spread across two", () => {
    const e = entry({ id: "1", keywords: ["sword"], secondaryKeywords: ["fire"], selective: true, content: "lore", scanDepth: 1, sticky: 1 });
    expect(matchLoreEntries([e], [msg("sword"), msg("fire")])).toEqual([]);
    expect(matchLoreEntries([e], [msg("sword of fire"), msg("calm")])).toEqual([e]);
  });

  it("ignores a negative sticky value", () => {
    const e = entry({ id: "1", keywords: ["dragon"], content: "lore", scanDepth: 1, sticky: -4 });
    expect(matchLoreEntries([e], [msg("dragon"), msg("a")])).toEqual([]);
  });
});

describe("matchLoreEntries probability", () => {
  const fillers = (n: number) => Array.from({ length: n }, (_, i) => msg(`dragon ${i}`));

  it("always fires at 100 or when unset, and never at 0", () => {
    const always = entry({ id: "1", keywords: ["dragon"], content: "a", probability: 100 });
    const unset = entry({ id: "2", keywords: ["dragon"], content: "b" });
    const never = entry({ id: "3", keywords: ["dragon"], content: "c", probability: 0 });
    for (let n = 1; n <= 30; n++) {
      expect(matchLoreEntries([always, unset, never], fillers(n))).toEqual([always, unset]);
    }
  });

  it("gives the same answer for the same entry and history, so a regenerated reply sees the same lore", () => {
    const e = entry({ id: "coin", keywords: ["dragon"], content: "lore", probability: 50 });
    for (let n = 1; n <= 30; n++) {
      expect(matchLoreEntries([e], fillers(n))).toEqual(matchLoreEntries([e], fillers(n)));
    }
  });

  it("fires about as often as its chance across a conversation", () => {
    const e = entry({ id: "coin", keywords: ["dragon"], content: "lore", probability: 30 });
    let fired = 0;
    for (let n = 1; n <= 1000; n++) {
      if (matchLoreEntries([e], fillers(n)).length > 0) fired++;
    }
    expect(fired).toBeGreaterThan(240);
    expect(fired).toBeLessThan(360);
  });

  it("rolls separately for different entries", () => {
    const rolls = (id: string) => Array.from({ length: 20 }, (_, i) => loreRoll(id, i + 1) < 50);
    expect(rolls("a")).not.toEqual(rolls("b"));
  });

  it("returns rolls in [0, 100)", () => {
    for (let i = 0; i < 500; i++) {
      const r = loreRoll(`id${i}`, i);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(100);
    }
  });

  it("applies to constant entries", () => {
    const e = entry({ id: "1", content: "lore", constant: true, probability: 0 });
    expect(matchLoreEntries([e], [msg("hello")])).toEqual([]);
  });

  it("applies to entries pulled in by other lore", () => {
    const court = entry({ id: "1", keywords: ["Silver Court"], content: "Ruled by Maeve." });
    const maeve = entry({ id: "2", keywords: ["Maeve"], content: "Maeve is ancient.", probability: 0 });
    expect(matchLoreEntries([court, maeve], [msg("the Silver Court")])).toEqual([court]);
  });

  it("keeps a sticky entry that passed its roll when it fired, even if a later roll would fail", () => {
    // Find an id whose roll passes at position 1 and fails at position 2.
    const id = Array.from({ length: 200 }, (_, i) => `e${i}`).find((x) => loreRoll(x, 1) < 50 && loreRoll(x, 2) >= 50)!;
    const base = { id, keywords: ["dragon"], content: "lore", scanDepth: 1, probability: 50 };
    const messages = [msg("dragon"), msg("dragon")];
    expect(matchLoreEntries([entry(base)], messages)).toEqual([]);
    const sticky = entry({ ...base, sticky: 1 });
    expect(matchLoreEntries([sticky], messages)).toEqual([sticky]);
  });
});
