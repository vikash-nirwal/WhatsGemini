import { Character } from "../../../types";

export interface MacroNames {
  char?: string;
  user?: string;
}

// Substitutes the placeholder macros community character cards (chub.ai,
// SillyTavern, TavernAI) are written with - {{char}}/{{user}} plus the legacy
// <BOT>/<USER> spellings - so an imported card's description, greeting and
// examples name the real character and the active persona instead of
// reaching the model (and the chat log) as literal braces. Case-insensitive,
// since cards in the wild use {{Char}}/{{User}} too. A missing name leaves
// that macro untouched rather than blanking it.
export const applyMacros = (text: string | undefined, names: MacroNames): string => {
  if (!text) return text || "";
  let out = text;
  if (names.char) out = out.replace(/\{\{char\}\}|<bot>/gi, names.char);
  if (names.user) out = out.replace(/\{\{user\}\}|<user>/gi, names.user);
  return out;
};

// The greetings a new chat with this character can open on: first_mes first,
// then each non-blank alternate greeting, in card order.
export const getGreetings = (character: Character | undefined): string[] => {
  if (!character) return [];
  return [character.first_mes || "", ...(character.alternateGreetings || [])].filter((g) => g.trim());
};
