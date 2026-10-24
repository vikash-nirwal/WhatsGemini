import { CharacterVoice, Message, VoiceNoteFrequency } from "../../types";
import { YOU } from "../../utils/constants";
import { isSpeechSupported, toSpokenText } from "./speech";

// Voice notes (#44): now and then a character's reply arrives as a voice
// message instead of text. The app decides, not the model: the reply is the
// same text either way, it's just shown as a playable bubble and spoken with
// the character's voice when played. Nothing but the text and the
// Message.isVoiceNote mark is stored.

export const VOICE_NOTE_CHANCE: Record<VoiceNoteFrequency, number> = {
  off: 0,
  sometimes: 0.15,
  often: 0.4,
};

// Past this a voice note is a monologue nobody would record; the reply stays text.
export const MAX_VOICE_NOTE_CHARS = 600;

// Rolled before the reply is generated, so the chat can show "recording
// audio..." instead of the text streaming in. Never for a picture or video
// reply, and never where this browser couldn't play it back.
export const rollVoiceNote = (voice: CharacterVoice | undefined, options: { mediaRequest?: boolean; random?: () => number; speechSupported?: boolean } = {}): boolean => {
  const chance = VOICE_NOTE_CHANCE[voice?.voiceNotes || "off"] ?? 0;
  if (chance <= 0 || options.mediaRequest) return false;
  if (!(options.speechSupported ?? isSpeechSupported())) return false;
  return (options.random ?? Math.random)() < chance;
};

// Whether a finished reply can still go out as the voice note that was
// rolled: it has to be something to say, not too long, with no pictures
// and not a flagged refusal.
export const fitsVoiceNote = (reply: { text?: string; images?: string[]; videos?: string[]; isRefusal?: boolean }): boolean => {
  if (reply.isRefusal || reply.images?.length || reply.videos?.length) return false;
  const spoken = toSpokenText(reply.text || "");
  return spoken.length > 0 && spoken.length <= MAX_VOICE_NOTE_CHARS;
};

// How the user's own voice notes reach the model, so the character knows it
// was spoken rather than typed.
export const VOICE_NOTE_MARK = "(voice note)";

export const markVoiceNote = (text: string): string => `${VOICE_NOTE_MARK} ${text}`;

// A quoted reply (#119) keeps its quote: yours as "(replying to ...)", a
// character's in the [Re: ...] form their prompt asks them to use.
const QUOTE_MAX = 120;
export const quoteFor = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX - 1).trimEnd()}…` : flat;
};

export const promptTextFor = (msg: Pick<Message, "role" | "txt" | "isVoiceNote" | "replyTo">): string => {
  const base = msg.isVoiceNote && msg.role === YOU ? markVoiceNote(msg.txt || "") : msg.txt || "";
  if (!msg.replyTo?.text) return base;
  return msg.role === YOU ? `(replying to "${quoteFor(msg.replyTo.text)}") ${base}` : `[Re: ${quoteFor(msg.replyTo.text)}] ${base}`;
};

// The bars of a voice note's waveform: made-up but steady heights (0.25-1)
// from the message id, so a note looks the same every time it's shown.
export const waveformBars = (seed: string, count = 28): number[] => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const r = ((h >>> 0) % 1000) / 1000;
    // A gentle envelope so the ends taper like speech does.
    const envelope = 0.55 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / count);
    bars.push(Math.round((0.25 + 0.75 * r * envelope) * 100) / 100);
  }
  return bars;
};
