import { extractStoryTags, hasStoryTags, stripStreamingStoryTags } from "./storyTags";

describe("story tags", () => {
  it("pulls each tag out wherever it is", () => {
    expect(extractStoryTags("Fine. Whatever.\n[Upset: you laughed at my painting]")).toEqual({ text: "Fine. Whatever.", tags: { upset: "you laughed at my painting" } });
    expect(extractStoryTags("[Made up] Come here, you.")).toEqual({ text: "Come here, you.", tags: { madeUp: true } });
    expect(extractStoryTags("I was home all night.\n[Lie: she was at the party]")).toEqual({ text: "I was home all night.", tags: { lie: "she was at the party" } });
    expect(extractStoryTags("Okay, I wasn't home.\n[Lie caught: 2]")).toEqual({ text: "Okay, I wasn't home.", tags: { lieCaught: 2 } });
    expect(extractStoryTags("So... are you moving away?\n[Rumor raised]")).toEqual({ text: "So... are you moving away?", tags: { rumorRaised: true } });
  });

  it("keeps several tags apart and leaves plain text alone", () => {
    const { text, tags } = extractStoryTags("Sorry. I lied.\n[Lie caught]\n[Made up]");
    expect(text).toBe("Sorry. I lied.");
    expect(tags).toEqual({ madeUp: true, lieCaught: 1 });
    expect(extractStoryTags("Just a reply [with brackets].")).toEqual({ text: "Just a reply [with brackets].", tags: {} });
    expect(hasStoryTags({})).toBe(false);
    expect(hasStoryTags({ upset: "x" })).toBe(true);
  });

  it("hides tags while a reply streams in", () => {
    expect(stripStreamingStoryTags("Fine.\n[Upset: you laughed]")).toBe("Fine.");
    expect(stripStreamingStoryTags("Fine.\n[Ups")).toBe("Fine.");
    expect(stripStreamingStoryTags("I was home.\n[Li")).toBe("I was home.");
    expect(stripStreamingStoryTags("A list [1] stays")).toBe("A list [1] stays");
  });
});
