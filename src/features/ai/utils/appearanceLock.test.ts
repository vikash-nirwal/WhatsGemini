import { appearanceLocksFor, applyAppearanceLocks, buildAppearanceLockInstruction, buildVisualTagsDraftPrompt, cleanVisualTags, lockedLookFor } from "./appearanceLock";

const MIRA = { name: "Mira", visualTags: "early 20s, slim, pale skin, long silver hair, violet eyes, small scar over left eyebrow" };
const KAI = { name: "Kai", visualTags: "tall, broad shoulders, dark brown skin, shaved head, grey stubble" };

describe("appearance lock", () => {
  it("keeps only characters with a locked look", () => {
    expect(appearanceLocksFor([MIRA, { name: "Bo", visualTags: "  " }, { name: "", visualTags: "x" }])).toEqual([MIRA]);
  });

  it("tells the prompt writer to copy each look word for word", () => {
    const text = buildAppearanceLockInstruction([MIRA, KAI]);
    expect(text).toContain("word for word");
    expect(text).toContain(`- Mira: ${MIRA.visualTags}`);
    expect(text).toContain(`- Kai: ${KAI.visualTags}`);
    expect(buildAppearanceLockInstruction([])).toBe("");
  });

  it("leaves a prompt alone when the look is already in it (ignoring case and spacing)", () => {
    const prompt = `masterpiece, ${MIRA.visualTags.toUpperCase().replace(/, /g, ",  ")}, sitting by a window`;
    expect(applyAppearanceLocks(prompt, [MIRA], "tags")).toBe(prompt);
  });

  it("puts a paraphrased-away look back at the front", () => {
    expect(applyAppearanceLocks("a silver-haired woman by a window", [MIRA], "tags")).toBe(`${MIRA.visualTags}, a silver-haired woman by a window`);
    expect(applyAppearanceLocks("Two friends at a bar.", [MIRA, KAI], "sentences")).toBe(
      `Mira: ${MIRA.visualTags}. Kai: ${KAI.visualTags}. Two friends at a bar.`
    );
  });

  it("only adds the ones that are missing", () => {
    const prompt = `${KAI.visualTags}, laughing`;
    expect(applyAppearanceLocks(prompt, [MIRA, KAI], "tags")).toBe(`${MIRA.visualTags}, ${prompt}`);
  });

  it("drafts and cleans a locked look", () => {
    expect(buildVisualTagsDraftPrompt("Mira", "A pale elf with silver hair.")).toContain("Description: A pale elf with silver hair.");
    expect(cleanVisualTags('Visual traits: "pale skin\nsilver hair\nviolet eyes"')).toBe("pale skin, silver hair, violet eyes");
  });
});

describe("wardrobe (#50)", () => {
  const wardrobe = [{ id: "w", name: "Work", description: "grey blazer, white shirt" }, { id: "e", name: "Empty", description: " " }];

  it("puts the current outfit after the fixed traits", () => {
    expect(lockedLookFor({ name: "Aria", visualTags: "silver hair, violet eyes.", wardrobe, currentOutfitId: "w" })).toBe("silver hair, violet eyes; outfit: grey blazer, white shirt");
    expect(lockedLookFor({ name: "Aria", wardrobe, currentOutfitId: "w" })).toBe("outfit: grey blazer, white shirt");
  });

  it("ignores no outfit, a missing one or an empty one", () => {
    expect(lockedLookFor({ name: "Aria", visualTags: "silver hair", wardrobe })).toBe("silver hair");
    expect(lockedLookFor({ name: "Aria", visualTags: "silver hair", wardrobe, currentOutfitId: "gone" })).toBe("silver hair");
    expect(lockedLookFor({ name: "Aria", visualTags: "silver hair", wardrobe, currentOutfitId: "e" })).toBe("silver hair");
  });

  it("reaches the image locks", () => {
    expect(appearanceLocksFor([{ name: "Aria", visualTags: "silver hair", wardrobe, currentOutfitId: "w" }])[0].visualTags).toContain("outfit: grey blazer");
  });
});
