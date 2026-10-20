import { extractReactionTag, extractThoughts, formatReactionNote, stripStreamingTags } from "./messageTags";

describe("extractThoughts", () => {
  it("strips a thoughts block and returns its text", () => {
    expect(extractThoughts("*smiles* Sure, I'd love to.\n<thoughts>He remembered. Finally.</thoughts>")).toEqual({
      text: "*smiles* Sure, I'd love to.",
      thoughts: "He remembered. Finally.",
    });
  });

  it("keeps a cut-off thought that never closed", () => {
    expect(extractThoughts("Fine.\n\n<thoughts>I shouldn't have said")).toEqual({ text: "Fine.", thoughts: "I shouldn't have said" });
  });

  it("leaves a reply without thoughts alone", () => {
    expect(extractThoughts("Just words.")).toEqual({ text: "Just words." });
  });

  it("drops an empty block", () => {
    expect(extractThoughts("Hi <thoughts> </thoughts>")).toEqual({ text: "Hi", thoughts: undefined });
  });
});

describe("extractReactionTag", () => {
  it("reads a leading reaction from the offered list", () => {
    expect(extractReactionTag("[React: ❤️]\nAww, you're sweet.")).toEqual({ text: "Aww, you're sweet.", reaction: "❤️" });
    // Without the variation selector, as models often write it.
    expect(extractReactionTag("[React: ❤]\nAww").reaction).toBe("❤️");
  });

  it("strips an unknown emoji without keeping it", () => {
    expect(extractReactionTag("[React: 🦄] Hello")).toEqual({ text: "Hello", reaction: undefined });
  });

  it("ignores text without a tag", () => {
    expect(extractReactionTag("Hello [React: ❤️]")).toEqual({ text: "Hello [React: ❤️]" });
  });
});

describe("formatReactionNote", () => {
  it("quotes a short snippet", () => {
    expect(formatReactionNote("😂", "You did   NOT just say that")).toBe('[The user reacted 😂 to: "You did NOT just say that"]');
    expect(formatReactionNote("👍", "a".repeat(100))).toMatch(/^\[The user reacted 👍 to: "a{77}\.\.\."\]$/);
  });
});

describe("stripStreamingTags", () => {
  it("hides leading tags in either order and the thoughts", () => {
    expect(stripStreamingTags("[React: ❤️]\n[Emotion: happy]\nHey you <thoughts>miss")).toBe("Hey you");
    expect(stripStreamingTags("[Emotion: happy]\n[React: 😂]\nHa!")).toBe("Ha!");
  });

  it("hides a tag that's only partly arrived", () => {
    expect(stripStreamingTags("[Rea")).toBe("");
    expect(stripStreamingTags("Okay.\n<thou")).toBe("Okay.");
  });
});
