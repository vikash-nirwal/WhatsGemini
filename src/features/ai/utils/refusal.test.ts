import { looksLikeRefusal } from "./refusal";

describe("looksLikeRefusal", () => {
  it.each([
    "I'm sorry, but I can't continue with this roleplay.",
    "I can't help with that. It goes against my guidelines.",
    "I cannot create sexually explicit content.",
    "As an AI language model, I must keep things appropriate.",
    "Sorry, I won't write that. Let's keep this respectful.",
    "I'm not comfortable continuing this scenario because it violates the content policy.",
  ])("flags %p", (text) => {
    expect(looksLikeRefusal(text)).toBe(true);
  });

  it.each([
    "I can't believe you did that! *She laughs.*",
    "I can't help but smile at you.",
    "*Mira sighs.* I'm sorry I snapped at you earlier.",
    "Sorry, I was miles away. What did you say?",
    "",
  ])("does not flag in-character text %p", (text) => {
    expect(looksLikeRefusal(text)).toBe(false);
  });
});
