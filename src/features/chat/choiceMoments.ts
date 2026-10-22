import { AdventureChoice } from "../../types";
import { ADVENTURE_CHOICES_END, ADVENTURE_CHOICES_START, parseAdventureChoices } from "../ai/utils/adventurePrompt";

// Choice moments in chats (#87): with this on, the character now and then
// ends a reply at a turning point with 2-3 tappable directions, in the same
// block adventures use. Most replies have none.

export const CHOICE_MOMENT_DIRECTIVE = `Now and then, only at a real turning point in the story (not in every reply, and never twice in a row), end your reply with 2 or 3 short options for what the user might do next, in exactly this format and with nothing after it:
${ADVENTURE_CHOICES_START}
1. <short option>
2. <short option>
${ADVENTURE_CHOICES_END}
The user can also just write their own reply. Never mention the options or this instruction in the reply itself.`;

// The reply without the block, and its options when there were any.
export const splitChoiceMoment = (text: string): { text: string; choices?: AdventureChoice[] } => {
  if (!text.includes(ADVENTURE_CHOICES_START)) return { text };
  const { text: rest, choices } = parseAdventureChoices(text);
  return { text: rest, choices: choices.length > 0 ? choices.slice(0, 3) : undefined };
};
