import { buildStoryMarkdown, storyFileName } from "./storyExport";
import { Message } from "../../types";

const at = new Date(2026, 0, 15);

describe("buildStoryMarkdown", () => {
  it("writes who said what, narration and pictures, skipping hidden messages", () => {
    const messages: Message[] = [
      { role: "you", txt: "seed", isSystem: true },
      { role: "ai", txt: "Hello there.", speakerId: 1 },
      { role: "you", txt: "Hi Mira." },
      { role: "you", txt: "The rain stops.", isNarration: true },
      { role: "ai", txt: "I can't continue this roleplay.", isRefusal: true },
      { role: "ai", txt: "Look!\n[Image Context: a sunset]", speakerId: 1, images: ["local:abc", "https://x.test/a.png"] },
    ];
    const md = buildStoryMarkdown({ title: "Mira", userName: "Arin", speakerNames: { 1: "Mira" }, primaryName: "Mira", messages, exportedAt: at });
    expect(md).toContain("# Mira");
    expect(md).toContain("**Mira:** Hello there.");
    expect(md).toContain("**Arin:** Hi Mira.");
    expect(md).toContain("*The rain stops.*");
    expect(md).toContain("**Mira:** Look!");
    expect(md).toContain("_(picture)_");
    expect(md).toContain("![Picture](https://x.test/a.png)");
    expect(md).not.toContain("seed");
    expect(md).not.toContain("can't continue");
    expect(md).not.toContain("Image Context");
  });

  it("puts each chapter's title and recap above its messages", () => {
    const messages: Message[] = [
      { role: "ai", txt: "One.", speakerId: 1 },
      { role: "you", txt: "summary 1", isCompressionSummary: true, chapterTitle: "The Ball", chapterRecap: "They danced." },
      { role: "ai", txt: "ok", isSystem: true },
      { role: "ai", txt: "Two.", speakerId: 1 },
      { role: "you", txt: "auto summary", isCompressionSummary: true },
      { role: "ai", txt: "Three.", speakerId: 1 },
    ];
    const md = buildStoryMarkdown({ title: "T", userName: "Arin", speakerNames: { 1: "Mira" }, primaryName: "Mira", messages, exportedAt: at });
    expect(md.indexOf("## Chapter 1: The Ball")).toBeLessThan(md.indexOf("**Mira:** One."));
    expect(md).toContain("> They danced.");
    expect(md.indexOf("## Chapter 2")).toBeLessThan(md.indexOf("**Mira:** Two."));
    expect(md).toContain("**Mira:** Three.");
    expect(md).not.toContain("auto summary");
  });

  it("has no chapter headings when no chapter was ended", () => {
    const md = buildStoryMarkdown({ title: "T", userName: "A", speakerNames: {}, primaryName: "M", messages: [{ role: "ai", txt: "Hi." }], exportedAt: at });
    expect(md).not.toContain("## Chapter");
  });
});

describe("storyFileName", () => {
  it("makes a safe file name", () => {
    expect(storyFileName("Aria & Kai: Part 2!")).toBe("aria-kai-part-2.md");
    expect(storyFileName("")).toBe("story.md");
  });
});
