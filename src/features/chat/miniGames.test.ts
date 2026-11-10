import { buildGameSection, buildGameStartDirective, extractGameOverTag, gameProgress, stripStreamingGameTag } from "./miniGames";
import { ChatGame } from "../../types";

const game = (overrides: Partial<ChatGame>): ChatGame => ({ kind: "twenty-questions", guesser: "user", turns: 0, startedAt: 0, ...overrides });

describe("gameProgress", () => {
  it("counts questions in 20 Questions and rounds otherwise", () => {
    expect(gameProgress(game({ turns: 4 }))).toBe("Question 4 of 20");
    // The character asks its first question when the game starts.
    expect(gameProgress(game({ guesser: "character", turns: 4 }))).toBe("Question 5 of 20");
    expect(gameProgress(game({ kind: "would-you-rather", turns: 2 }))).toBe("Round 3");
  });

  it("counts a Truth or Dare round as three replies", () => {
    expect(gameProgress(game({ kind: "truth-or-dare", turns: 0 }))).toBe("Round 1");
    expect(gameProgress(game({ kind: "truth-or-dare", turns: 2 }))).toBe("Round 1");
    expect(gameProgress(game({ kind: "truth-or-dare", turns: 3 }))).toBe("Round 2");
  });
});

describe("buildGameSection", () => {
  it("tells the character its role in 20 Questions", () => {
    expect(buildGameSection(game({ turns: 7 }), "Aria")).toContain("Questions asked so far: 7 of 20.");
    expect(buildGameSection(game({ guesser: "character", turns: 19 }), "Aria")).toContain("This is your last question");
    expect(buildGameSection(game({ turns: 20 }), "Aria")).toContain("reveal the answer now");
  });

  it("always explains the end tag", () => {
    for (const kind of ["twenty-questions", "would-you-rather"] as const) {
      expect(buildGameSection(game({ kind }), "Aria")).toContain("[Game over: user wins]");
    }
    // Truth or Dare has no winner to name.
    const truthOrDare = buildGameSection(game({ kind: "truth-or-dare" }), "Aria");
    expect(truthOrDare).toContain("[Game over]");
    expect(truthOrDare).not.toContain("wins]");
  });

  it("walks Truth or Dare through its steps", () => {
    const at = (turns: number) => buildGameSection(game({ kind: "truth-or-dare", turns }), "Aria");
    expect(at(0)).toContain("Never choose for the user");
    expect(at(0)).toContain("the user has just picked truth or dare");
    expect(at(1)).toContain("the user has just answered their truth or done their dare");
    expect(at(2)).toContain("the user has just given you your truth or dare");
    expect(at(3)).toContain("the user has just picked truth or dare");
    expect(at(3)).toContain("Round 2.");
  });

  it("starts the game with the first move", () => {
    expect(buildGameStartDirective(game({ kind: "truth-or-dare" }), "Aria")).toContain('ask them "Truth or dare?"');
  });
});

describe("game over tag", () => {
  it("reads who won and strips the tag", () => {
    expect(extractGameOverTag("Yes! It was a penguin!\n[Game over: user wins]")).toEqual({ text: "Yes! It was a penguin!", gameOver: "user" });
    expect(extractGameOverTag("Ha, it was the moon. [Game over: character wins]").gameOver).toBe("character");
    expect(extractGameOverTag("That was fun.\n[Game over]").gameOver).toBe("none");
    expect(extractGameOverTag("Next question?")).toEqual({ text: "Next question?" });
  });

  it("is hidden while streaming", () => {
    expect(stripStreamingGameTag("Got it!\n[Game ov")).toBe("Got it!");
    expect(stripStreamingGameTag("Got it!\n[Game over: user wins]")).toBe("Got it!");
  });
});
