import { buildCoWritingDirective, buildNextIdeasPrompt, NEXT_IDEA_COUNT } from "./coWriting";

describe("co-writing mode", () => {
  it("asks the character to continue the story, not to chat", () => {
    const d = buildCoWritingDirective("Aria", "Vik");
    expect(d).toContain("You and Vik are co-writing a story together");
    expect(d).toContain("Don't reply to Vik");
  });

  it("asks for a few ideas for what happens next", () => {
    const p = buildNextIdeasPrompt("Vik", "Aria", "The train stopped.");
    expect(p).toContain("The train stopped.");
    expect(p).toContain(`Suggest ${NEXT_IDEA_COUNT} different things that could happen next`);
  });
});
