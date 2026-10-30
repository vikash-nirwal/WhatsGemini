import { World } from "../../types";

// A world's own language (2026-10-30): everyone there speaks and writes in
// it, in chats, texts between residents, statuses and the narrator alike.
// Unset, every prompt keeps following whatever language the chat is in.
export const worldLanguageLine = (world: Pick<World, "name" | "language"> | undefined): string | undefined => {
  const language = world?.language?.trim();
  if (!language) return undefined;
  return `Everyone in ${world!.name} speaks ${language}: write all dialogue, messages and narration in ${language}, whatever language the request itself is written in.`;
};

// A world's reply length target wins over the one in Settings, so a world
// can be terse or wordy without changing every other chat.
export const replyLengthFor = (world: Pick<World, "replyLengthLimit"> | undefined, fallback: number): number =>
  world?.replyLengthLimit && world.replyLengthLimit > 0 ? world.replyLengthLimit : fallback;

// Common choices for the language field; any other language can be typed.
export const WORLD_LANGUAGE_PRESETS = ["English", "Hindi", "Hinglish", "Spanish", "French", "German", "Portuguese", "Italian", "Japanese", "Korean", "Chinese", "Arabic", "Russian"];
