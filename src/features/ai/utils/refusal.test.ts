import { looksLikePromptRefusal, looksLikeRefusal } from "./refusal";

describe("looksLikeRefusal", () => {
  it.each([
    "I'm sorry, but I can't continue with this roleplay.",
    "I can't help with that. It goes against my guidelines.",
    "I cannot create sexually explicit content.",
    "As an AI language model, I must keep things appropriate.",
    "Sorry, I won't write that. Let's keep this respectful.",
    "I'm not comfortable continuing this scenario because it violates the content policy.",
    "I can't create a sexually explicit image prompt. I can help with a tasteful one instead.",
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

describe("looksLikePromptRefusal", () => {
  it.each([
    "I can't create a sexually explicit image prompt. I can help with something else.",
    "I'm sorry, I can't do that.",
    "Sorry, that's not something I'll write.",
    '"I cannot write this prompt."',
  ])("flags %p", (text) => {
    expect(looksLikePromptRefusal(text)).toBe(true);
  });

  it.each(["1girl, solo, rainy cafe window, smiling", "a woman taking a selfie by a rainy window", ""])("does not flag the prompt %p", (text) => {
    expect(looksLikePromptRefusal(text)).toBe(false);
  });
});
