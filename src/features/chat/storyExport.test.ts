import { bookFileName, buildBookHtml, buildBookMarkdown, buildStoryMarkdown, storyFileName } from "./storyExport";
import { emptyScript, makeBeat } from "./storyScript";
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

describe("a story as a book (#241)", () => {
  const script = { ...emptyScript(), premise: "A ball in Meryton.", beats: [makeBeat("Darcy's insult."), makeBeat("Wickham's tale.")] };
  const messages: Message[] = [
    { role: "ai", txt: "The ballroom glitters.", beat: 1, choices: [{ id: "c1", label: "Dance with Darcy" }] },
    { role: "you", txt: "I dance.", chosenChoiceId: "c1", skillCheck: { skill: "charm", dc: 10, roll: 12, total: 12, success: true } as any },
    { role: "ai", txt: "**Darcy:** \"Tolerable.\"", beat: 1 },
    { role: "you", txt: "summary", isCompressionSummary: true, chapterTitle: "The Ball", chapterRecap: "Darcy was rude." },
    { role: "ai", txt: "Understood", isSystem: true },
    { role: "ai", txt: "Wickham smiles. <script>alert(1)</script>", beat: 2 },
  ];
  const input = { title: "Meryton", premise: "A ball in Meryton.", playerName: "Jane", script, messages };

  it("writes Markdown with the premise, chapters, beats and the player's turns set apart", () => {
    const md = buildBookMarkdown(input);
    expect(md.startsWith("# Meryton\n\n_A ball in Meryton._")).toBe(true);
    expect(md.indexOf("## Chapter 1: The Ball")).toBeLessThan(md.indexOf("### Darcy's insult."));
    expect(md.indexOf("### Darcy's insult.")).toBeLessThan(md.indexOf("The ballroom glitters."));
    expect(md).toContain("> Darcy was rude.");
    expect(md).toContain("> **Jane:** I dance.");
    expect(md.indexOf("## Chapter 2")).toBeLessThan(md.indexOf("### Wickham's tale."));
    expect(md.match(/### Darcy's insult\./g)).toHaveLength(1);
    expect(md).not.toContain("Dance with Darcy");
    expect(md).not.toContain("summary");
    expect(md).not.toContain("Understood");
    expect(md).not.toContain("charm");
  });

  it("writes a self-contained HTML page, escaping what the story says", () => {
    const html = buildBookHtml(input);
    expect(html).toContain("<title>Meryton</title>");
    expect(html).toContain("<h2>Chapter 1: The Ball</h2>");
    expect(html).toContain("<h3>Darcy's insult.</h3>");
    expect(html).toContain('<p class="player"><strong>Jane:</strong> I dance.</p>');
    expect(html).toContain("<strong>Darcy:</strong> &quot;Tolerable.&quot;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/<link|src="(?!https?:)/);
  });

  it("names the files", () => {
    expect(bookFileName("Meryton Ball", "html")).toBe("meryton-ball.html");
    expect(bookFileName("Meryton Ball", "md")).toBe("meryton-ball.md");
  });
});
