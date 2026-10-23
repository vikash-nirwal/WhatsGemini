import { Character, Chat, Message } from "../../types";
import { AI } from "../../utils/constants";
import { secretsInPlay } from "./secrets";
import { openPlans } from "../chat/sharedPlans";
import { dayKey } from "./badDays";

// Dreams (#94): with the switch on, now and then (at most every few days)
// the first reply of a morning opens with a dream the character had - built
// from what they really remember, plans you made and a secret they're still
// keeping (#81), scrambled and symbolic. A morning text (#93) can be the
// dream instead. The reply gets a small "A dream" note.

export const DREAM_GAP_MS = 3 * 24 * 60 * 60 * 1000;

export const isMorning = (now: number): boolean => {
  const hour = new Date(now).getHours();
  return hour >= 5 && hour < 12;
};

// Whether the character has already written today in this chat.
const repliedToday = (content: Message[] | undefined, now: number): boolean => {
  const today = dayKey(now);
  return (content || []).some((m) => m.role === AI && !m.isSystem && m.timestamp != null && dayKey(m.timestamp) === today);
};

export const dreamDue = (character: Pick<Character, "dreams" | "lastDreamAt"> | undefined, chat: Pick<Chat, "content"> | undefined, now: number): boolean =>
  Boolean(character?.dreams) &&
  isMorning(now) &&
  (!character!.lastDreamAt || now - character!.lastDreamAt >= DREAM_GAP_MS) &&
  !repliedToday(chat?.content, now);

export interface DreamIngredients {
  memories: string[];
  plans: string[];
  secret?: string;
}

// A few real things to dream about: recent memories, open plans, and one
// secret that hasn't come out yet.
export const dreamIngredients = (character: Character, chat: Chat | undefined): DreamIngredients => ({
  memories: [...(character.pinnedMemory || []), ...(character.memory || [])].slice(-4),
  plans: openPlans(chat?.plans).slice(0, 2).map((p) => p.what),
  secret: secretsInPlay(character, chat).hidden[0]?.text,
});

const ingredientLines = (ingredients: DreamIngredients): string[] => [
  ...ingredients.memories.map((m) => `- ${m}`),
  ...ingredients.plans.map((p) => `- a plan you made together: ${p}`),
  ...(ingredients.secret ? [`- (your secret, which the dream may brush against in a symbol, never say it outright) ${ingredients.secret}`] : []),
];

export const buildDreamDirective = (name: string, userName: string, ingredients: DreamIngredients): string => {
  const lines = ingredientLines(ingredients);
  return `${name} had a vivid dream last night. Open this reply by telling ${userName} about it in a few sentences, in your own voice, the way people describe dreams (half-remembered, a bit embarrassed or amused): surreal and symbolic, things blending into each other.${lines.length > 0 ? `\nWeave in scrambled fragments of:\n${lines.join("\n")}` : ""}\nThen carry on naturally.`;
};
