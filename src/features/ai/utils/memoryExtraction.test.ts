import { applyMemoryChanges, buildMemoryExtractionPrompt, parseMemoryChanges, carryMemoryCategories, NO_MEMORY_CHANGES, MemoryChanges, groupMemoryFacts, nextMemoryCategory } from "./memoryExtraction";
import { MAX_MEMORY_ENTRIES } from "../../../utils/constants";

const changes = (patch: Partial<MemoryChanges>): MemoryChanges => ({ ...NO_MEMORY_CHANGES, ...patch });

describe("parseMemoryChanges", () => {
  it("reads new facts, updates, forgets and reconfirmations", () => {
    const reply = [
      "- Arin's sister is called Lena.",
      "UPDATE 2: Arin moved to Berlin.",
      "FORGET 3",
      "STILL TRUE: 1, 4",
    ].join("\n");
    expect(parseMemoryChanges(reply, 4)).toEqual({
      added: ["Arin's sister is called Lena."],
      updated: [{ index: 1, text: "Arin moved to Berlin." }],
      forgotten: [2],
      reinforced: [0, 3],
    });
  });

  it("treats NONE as no changes", () => {
    expect(parseMemoryChanges("NONE", 3)).toEqual(NO_MEMORY_CHANGES);
    expect(parseMemoryChanges("  none.  ", 3)).toEqual(NO_MEMORY_CHANGES);
  });

  it("tolerates small formatting drift", () => {
    const reply = "**UPDATE #1 - Mira now trusts Arin.**\n* Arin hates rain\nforget #2\nStill true 3";
    expect(parseMemoryChanges(reply, 3)).toEqual({
      added: ["Arin hates rain"],
      updated: [{ index: 0, text: "Mira now trusts Arin." }],
      forgotten: [1],
      reinforced: [2],
    });
  });

  it("ignores numbers that don't point at a known fact", () => {
    const reply = "UPDATE 9: nope\nFORGET 0\nSTILL TRUE: 2, 7";
    expect(parseMemoryChanges(reply, 2)).toEqual(changes({ reinforced: [1] }));
  });
});

describe("applyMemoryChanges", () => {
  const memory = ["Arin lives in Paris.", "Mira owes Arin a favor.", "Arin likes tea."];

  it("replaces an updated fact instead of keeping both versions", () => {
    const result = applyMemoryChanges(memory, changes({ updated: [{ index: 0, text: "Arin moved to Berlin." }] }));
    expect(result).not.toContain("Arin lives in Paris.");
    expect(result).toContain("Arin moved to Berlin.");
    expect(result).toHaveLength(3);
  });

  it("drops forgotten facts", () => {
    expect(applyMemoryChanges(memory, changes({ forgotten: [1] }))).toEqual(["Arin lives in Paris.", "Arin likes tea."]);
  });

  it("moves updated and reconfirmed facts to the end, so they're evicted last", () => {
    const result = applyMemoryChanges(memory, changes({ reinforced: [0], added: ["Lena is Arin's sister."] }));
    expect(result).toEqual(["Mira owes Arin a favor.", "Arin likes tea.", "Arin lives in Paris.", "Lena is Arin's sister."]);
  });

  it("skips new facts that repeat a known or pinned one", () => {
    const result = applyMemoryChanges(memory, changes({ added: ["arin likes tea", "Arin is a knight.", "Arin is a knight"] }), ["Arin is a knight."]);
    expect(result).toEqual(memory);
  });

  it("evicts the least recently touched facts once over the cap", () => {
    const full = Array.from({ length: MAX_MEMORY_ENTRIES }, (_, i) => `fact ${i}`);
    const result = applyMemoryChanges(full, changes({ reinforced: [0], added: ["brand new"] }));
    expect(result).toHaveLength(MAX_MEMORY_ENTRIES);
    expect(result).not.toContain("fact 1"); // the oldest one nobody mentioned again
    expect(result).toContain("fact 0"); // the oldest, but just reconfirmed
    expect(result[result.length - 1]).toBe("brand new");
  });

  it("forgetting wins over an update to the same fact", () => {
    const result = applyMemoryChanges(memory, changes({ forgotten: [0], updated: [{ index: 0, text: "x" }] }));
    expect(result).toEqual(["Mira owes Arin a favor.", "Arin likes tea."]);
  });
});

describe("buildMemoryExtractionPrompt", () => {
  it("numbers editable facts and lists pinned ones separately", () => {
    const prompt = buildMemoryExtractionPrompt("Arin: hi", ["Arin lives in Paris."], ["Arin is a knight."], { userName: "Arin", charName: "Mira" });
    expect(prompt).toContain("1. Arin lives in Paris.");
    expect(prompt).toContain("- Arin is a knight.");
    expect(prompt).not.toContain("1. Arin is a knight.");
    expect(prompt).toContain("roleplay character (Mira)");
  });
});

describe("memory categories", () => {
  it("reads a category tag off new and updated facts", () => {
    const parsed = parseMemoryChanges("- [user] Arin hates rain.\nUPDATE 1: [relationship] Mira trusts Arin now.\n- [weird] Lena visited.", 1);
    expect(parsed.added).toEqual(["Arin hates rain.", "Lena visited."]);
    expect(parsed.updated).toEqual([{ index: 0, text: "Mira trusts Arin now." }]);
    expect(parsed.categories).toEqual({ "Arin hates rain.": "user", "Mira trusts Arin now.": "relationship" });
  });

  it("leaves categories unset when the model gives none", () => {
    expect(parseMemoryChanges("- Arin hates rain.", 0).categories).toBeUndefined();
  });

  it("carries categories across updates and drops forgotten facts", () => {
    const existing = ["Arin lives in Paris.", "Mira owes Arin a favor."];
    const previous = { "Arin lives in Paris.": "user" as const, "Mira owes Arin a favor.": "relationship" as const };
    const changes: MemoryChanges = { ...NO_MEMORY_CHANGES, updated: [{ index: 0, text: "Arin moved to Berlin." }], forgotten: [1], added: ["The inn burned down."], categories: { "The inn burned down.": "story" } };
    const merged = applyMemoryChanges(existing, changes);
    expect(carryMemoryCategories(merged, [], previous, existing, changes)).toEqual({
      "Arin moved to Berlin.": "user",
      "The inn burned down.": "story",
    });
  });

  it("keeps pinned facts' categories", () => {
    expect(carryMemoryCategories([], ["Arin is a knight."], { "Arin is a knight.": "user" }, [], NO_MEMORY_CHANGES)).toEqual({ "Arin is a knight.": "user" });
  });

  it("asks the model to tag each fact", () => {
    expect(buildMemoryExtractionPrompt("x", [], [], { userName: "Arin" })).toContain("[user] (about Arin)");
  });
});

describe("memory groups", () => {
  it("groups facts once any has a group, and keeps their positions", () => {
    const groups = groupMemoryFacts(["a", "b", "c"], { a: "user", c: "story" });
    expect(groups.map((g) => [g.key, g.items.map((i) => `${i.fact}${i.idx}`)])).toEqual([["user", ["a0"]], ["relationship", []], ["story", ["c2"]], ["other", ["b1"]]]);
    expect(groupMemoryFacts(["a", "b"], {}).find((g) => g.key === "other")!.items).toHaveLength(2);
  });

  it("cycles a fact's group and back to unsorted", () => {
    expect(nextMemoryCategory(undefined)).toBe("user");
    expect(nextMemoryCategory("story")).toBeUndefined();
  });
});

describe("where things stand (#142)", () => {
  it("asks for the paragraph and reads it, changes or not", () => {
    expect(buildMemoryExtractionPrompt("Sam: hi", [], [], { userName: "Sam", charName: "Aria" })).toContain('starting with "STANDING:"');
    const reply = "[story] They went to the fair.\nSTANDING: Sam and Aria went to the fair on Saturday; that's done.\nThey still plan the beach trip.";
    const changes = parseMemoryChanges(reply, 0);
    expect(changes.added).toEqual(["They went to the fair."]);
    expect(changes.standing).toBe("Sam and Aria went to the fair on Saturday; that's done. They still plan the beach trip.");
    expect(parseMemoryChanges("NONE\nSTANDING: Nothing new; still friends.", 2)).toEqual({ ...NO_MEMORY_CHANGES, standing: "Nothing new; still friends." });
  });
});
