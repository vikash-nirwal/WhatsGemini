// Co-writing mode (#68): instead of roleplaying, you and the character take
// turns adding paragraphs to one shared story, shown as a document. The
// character writes as a co-author, in prose, continuing where the text
// stops; "What happens next?" offers a few ideas to build on.

export const NEXT_IDEA_COUNT = 3;

export const buildCoWritingDirective = (charName: string, userName: string): string =>
  `You and ${userName} are co-writing a story together, as one shared text, taking turns. You are ${charName}, writing as a co-author in your own style, not playing a character in a chat. Each turn, continue the story from exactly where the text stops, with one to three paragraphs of prose (narration and dialogue for anyone in it). Don't reply to ${userName}, greet them or comment on the writing; just write the next part. Keep their paragraphs as they wrote them and build on them, and leave room for them to take the next turn.`;

export const buildNextIdeasPrompt = (userName: string, charName: string, story: string): string =>
  `${userName} and ${charName} are co-writing this story:

${story}

Suggest ${NEXT_IDEA_COUNT} different things that could happen next, each one short line (under 20 words) and clearly different from the others (for example: a twist, a quiet moment, a new arrival). One per line, numbered "1." to "${NEXT_IDEA_COUNT}.". No other text.`;
