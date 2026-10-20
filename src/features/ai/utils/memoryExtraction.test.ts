import { applyMemoryChanges, buildMemoryExtractionPrompt, parseMemoryChanges, NO_MEMORY_CHANGES, MemoryChanges } from "./memoryExtraction";
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
