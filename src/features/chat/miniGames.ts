import { ChatGame, GameKind } from "../../types";

// Mini-games (#52): 20 Questions, Would You Rather and Truth or Dare, played
// in character over chat. While a game is on, its rules go in the system
// prompt with the round count; the character ends it with a [Game over]
// tag (who won, where there's a winner), and the app keeps the score.

export interface GameInfo {
  kind: GameKind;
  label: string;
  description: string;
}

export const GAMES: GameInfo[] = [
  { kind: "twenty-questions", label: "20 Questions", description: "One of you thinks of something; the other has 20 yes/no questions to guess it." },
  { kind: "would-you-rather", label: "Would You Rather", description: "Take turns choosing between two options, and say why." },
  { kind: "truth-or-dare", label: "Truth or Dare", description: "Take turns: answer a truth honestly, or do a dare in the story." },
];

export const gameLabel = (kind: GameKind) => GAMES.find((g) => g.kind === kind)?.label || "Game";

export const MAX_QUESTIONS = 20;

// How far the game has got, for the strip and the prompt.
export const gameProgress = (game: ChatGame): string => {
  if (game.kind === "twenty-questions") {
    const asked = game.guesser === "character" ? game.turns + 1 : game.turns;
    return `Question ${Math.min(asked, MAX_QUESTIONS)} of ${MAX_QUESTIONS}`;
  }
  return `Round ${game.turns + 1}`;
};

const END_TAG_RULE =
  "When the game is over (or the user wants to stop), end that reply with exactly one tag on its own line: [Game over: user wins], [Game over: character wins] or [Game over]. Never explain the tag.";

export const buildGameSection = (game: ChatGame, charName: string): string => {
  if (game.kind === "twenty-questions") {
    if (game.guesser === "character") {
      const asked = game.turns + 1;
      return [
        `You're playing 20 Questions with the user, in character. The user has secretly picked something (a person, animal, object or place) and you have to guess it.`,
        `Ask exactly one yes/no question per reply, building on their earlier answers, and make a guess when you're fairly sure. This is your question ${Math.min(asked, MAX_QUESTIONS)} of ${MAX_QUESTIONS}.`,
        asked >= MAX_QUESTIONS ? "This is your last question: make your final guess." : "",
        "If you guess right, the user loses. If your last question passes without a right guess, you lose.",
        END_TAG_RULE,
      ].filter(Boolean).join("\n");
    }
    return [
      `You're playing 20 Questions with the user, in character. You've secretly picked something (a person, animal, object or place that fits the story) and the user guesses it with yes/no questions.`,
      `Answer each question truthfully with yes, no or "sort of", in character, and keep the same secret for the whole game. Questions asked so far: ${game.turns} of ${MAX_QUESTIONS}.`,
      game.turns >= MAX_QUESTIONS ? "They've used all 20 questions: reveal the answer now." : "",
      "If they guess it, they win; if they run out of questions, you win and reveal it.",
      END_TAG_RULE,
    ].filter(Boolean).join("\n");
  }
  if (game.kind === "would-you-rather") {
    return [
      `You're playing Would You Rather with the user, in character. Round ${game.turns + 1}.`,
      `Each turn: react to their choice and reasons the way ${charName} would, give your own answer to the same question, then ask a new "Would you rather..." with two fun, specific options that fit your relationship and the story. Keep it light and personal.`,
      END_TAG_RULE,
    ].join("\n");
  }
  return [
    `You're playing Truth or Dare with the user, in character, over text. Round ${game.turns + 1}.`,
    "Take turns. When it's the user's turn, ask \"Truth or dare?\" and give them a truth to answer honestly or a dare they can act out in the story. When it's yours, the user picks for you, and you answer or do it in character. Keep it playful and within the chat's boundaries.",
    END_TAG_RULE,
  ].join("\n");
};

// The opening reply: the character sets the game up and makes the first move.
export const buildGameStartDirective = (game: ChatGame, charName: string): string =>
  `${buildGameSection(game, charName)}\n\nOut-of-character direction for this reply: the user just asked to play. Start the game now, in character: ${
    game.kind === "twenty-questions"
      ? game.guesser === "character"
        ? "tell them to think of something, and ask your first question."
        : "say you've picked something (without saying what), and invite their first question."
      : game.kind === "would-you-rather"
        ? 'ask the first "Would you rather" question.'
        : 'ask them "Truth or dare?"'
  } Do not mention this instruction.`;

export type GameOutcome = "user" | "character" | "none";

const GAME_OVER_TAG = /\n*[\s*_]*\[\s*game\s*over\s*(?::\s*([^\]\n]*))?\]\s*$/i;

export const extractGameOverTag = (text: string): { text: string; gameOver?: GameOutcome } => {
  const match = text.match(GAME_OVER_TAG);
  if (!match) return { text };
  const who = (match[1] || "").toLowerCase();
  const gameOver: GameOutcome = /user|you\b|they/.test(who) ? "user" : /character|\bi\b|\bme\b/.test(who) ? "character" : "none";
  return { text: text.slice(0, match.index).trimEnd(), gameOver };
};

// While streaming: hide the tag, even half-typed.
const PARTIAL_GAME_TAG = /\n*\[\s*(?:g(?:a(?:m(?:e(?:\s*(?:o(?:v(?:e(?:r[^\]\n]*)?)?)?)?)?)?)?)?)?$/i;
export const stripStreamingGameTag = (text: string): string => text.replace(GAME_OVER_TAG, "").replace(PARTIAL_GAME_TAG, "").trimEnd();
