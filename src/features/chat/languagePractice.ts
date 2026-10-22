import { ChatLanguage } from "../../types";

// Language practice mode (#67): the character replies in the language
// you're learning, at your level, and gently corrects mistakes in your
// messages in a hidden <fix> block that shows as a note under them. Any
// reply can be translated into your own language.

export const PRACTICE_LANGUAGES = [
  "Spanish", "French", "German", "Italian", "Portuguese", "Japanese", "Korean", "Chinese (Mandarin)", "Hindi", "Arabic",
  "Russian", "Turkish", "Dutch", "Swedish", "Polish", "Greek", "Indonesian", "Vietnamese", "Thai", "English",
];

const LEVEL_RULES: Record<ChatLanguage["level"], string> = {
  beginner: "Use short, simple sentences and everyday words, mostly in the present tense. Avoid idioms and slang.",
  intermediate: "Use natural everyday language with some variety in tenses and vocabulary; explain nothing unless asked.",
  advanced: "Speak as a native speaker would, idioms and nuance included.",
};

export const buildLanguageDirective = (language: ChatLanguage, userName: string): string =>
  [
    `${userName} is practising ${language.target}. Always reply in ${language.target}, staying fully in character, even when ${userName} writes in another language.`,
    LEVEL_RULES[language.level],
    `If ${userName}'s last message has real mistakes in ${language.target} (grammar, word choice, spelling), add after your reply, on its own line, exactly: <fix>the corrected sentence(s) - a very short reason</fix>. Leave it out when the message was fine or wasn't in ${language.target}. Never mention the block in your reply itself.`,
  ].join(" ");

// The language the browser is set to, for translations ("English" when unknown).
export const browserLanguageName = (): string => {
  try {
    const code = (typeof navigator !== "undefined" && navigator.language) || "en";
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code.split("-")[0]) || "English";
  } catch {
    return "English";
  }
};

export const buildTranslatePrompt = (text: string, into: string): string =>
  `Translate this message into ${into}. Keep its tone and meaning; keep *actions in asterisks* as they are. Reply with only the translation.\n\n${text}`;
