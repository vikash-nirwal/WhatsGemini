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

// A Truth or Dare round takes three replies: the character gives the user
// their truth or dare, then reacts and takes its own pick, then does what
// the user set and asks again. Counting every reply as a round made the
// strip race ahead of the game.
const TRUTH_OR_DARE_STEPS = 3;

export const gameRound = (game: ChatGame): number =>
  game.kind === "truth-or-dare" ? Math.floor(game.turns / TRUTH_OR_DARE_STEPS) + 1 : game.turns + 1;

// How far the game has got, for the strip and the prompt.
export const gameProgress = (game: ChatGame): string => {
  if (game.kind === "twenty-questions") {
    const asked = game.guesser === "character" ? game.turns + 1 : game.turns;
    return `Question ${Math.min(asked, MAX_QUESTIONS)} of ${MAX_QUESTIONS}`;
  }
  return `Round ${gameRound(game)}`;
};

const END_TAG_RULE =
  "When the game is over (or the user wants to stop), end that reply with exactly one tag on its own line: [Game over: user wins], [Game over: character wins] or [Game over]. Never explain the tag.";

// Truth or Dare has no winner, so offering the winner tags only invited a
// made-up result.
const NO_WINNER_END_RULE =
  "When the user wants to stop (or the game has run its course), end that reply with the tag [Game over] on its own line. Nobody wins this game. Never explain the tag.";

export const buildGameSection = (game: ChatGame, charName: string, opening = false): string => {
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
  // Truth or Dare used to get one loose paragraph, and the character would
  // ask "Truth or dare?" and hand out the truth or dare in the same reply,
  // without waiting for the pick. The steps are spelled out now, with a hint
  // at which one this reply most likely is; the conversation still wins, as
  // the user may skip ahead or answer in two messages.
  const step = game.turns % TRUTH_OR_DARE_STEPS;
  const likely =
    step === 0
      ? "the user has just picked truth or dare (step 2)"
      : step === 1
        ? "the user has just answered their truth or done their dare (step 3)"
        : "the user has just given you your truth or dare (step 4)";
  return [
    `You're playing Truth or Dare with the user, in character, over text. Round ${gameRound(game)}.`,
    "A round goes in these steps, one step per reply:",
    '1. You ask "Truth or dare?" and stop there. Never choose for the user, and never give the truth or dare before they\'ve picked.',
    "2. The user picks. If they picked truth, ask one personal question for them to answer honestly. If they picked dare, give one dare they can act out in the story. Then stop and wait.",
    `3. The user answers or does the dare. React to it the way ${charName} would. Then it's your turn: say whether you pick truth or dare yourself, and ask the user to give you one.`,
    '4. The user gives you a question or a dare. Answer it honestly, or do the dare, in character and in full. Then ask "Truth or dare?" to start the next round.',
    // The opening reply is step 1, which its own direction says.
    opening ? "" : `Going by the count, ${likely}. If the conversation shows a different step (they haven't picked yet, they skipped ahead, they chickened out), follow the conversation.`,
    "Make each truth and dare fit your relationship and the story, don't repeat earlier ones, and keep it playful and within the chat's boundaries.",
    NO_WINNER_END_RULE,
  ].filter(Boolean).join("\n");
};

// The opening reply: the character sets the game up and makes the first move.
export const buildGameStartDirective = (game: ChatGame, charName: string): string =>
  `${buildGameSection(game, charName, true)}\n\nOut-of-character direction for this reply: the user just asked to play. Start the game now, in character: ${
    game.kind === "twenty-questions"
      ? game.guesser === "character"
        ? "tell them to think of something, and ask your first question."
        : "say you've picked something (without saying what), and invite their first question."
      : game.kind === "would-you-rather"
        ? 'ask the first "Would you rather" question.'
        : 'ask them "Truth or dare?" and nothing more: wait for their pick.'
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
