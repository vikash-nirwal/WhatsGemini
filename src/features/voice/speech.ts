import { CharacterVoice } from "../../types";
import { extractEmotionTag } from "../ai/utils/emotionUtils";
import { stripStreamingTags } from "../ai/utils/messageTags";

// Text-to-speech (#12) with the browser's own Web Speech API: free, no key,
// no server, and on most systems the voices work offline. Everything here
// checks for the API first, since some browsers (and jsdom) don't have it.

export const DEFAULT_RATE = 1;
export const DEFAULT_PITCH = 1;

export const getSynth = (): SpeechSynthesis | undefined =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function"
    ? window.speechSynthesis
    : undefined;

export const isSpeechSupported = (): boolean => Boolean(getSynth());

// What gets read aloud: the words the character says, without *actions*,
// control tags, the image-context tag, markdown symbols, links or emoji
// (which voices read out by name, "smiling face with heart eyes").
export const toSpokenText = (text: string): string => {
  // The image-context tag's pattern from stripImageContextTag, repeated here
  // so speech doesn't pull in the image providers.
  let out = stripStreamingTags((text || "").replace(/\n*\[Image Context:[\s\S]*?\]\s*$/i, ""));
  out = extractEmotionTag(out).text;
  out = out
    .replace(/\[\s*(?:emotion|react(?:ion|ed)?|image context)\s*:[^\]]*\]/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*[^*\n]+\*/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-+][ \t]+|\d+[.)][ \t]+)/gm, "")
    .replace(/[*_~`#]/g, "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "");
  return out.replace(/\s+/g, " ").trim();
};

// Long utterances get cut off after about 15 seconds in Chrome, so speech is
// queued as sentence-sized pieces instead of one long string.
const MAX_CHUNK = 200;

export const splitForSpeech = (text: string): string[] => {
  const sentences = text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const push = (piece: string) => {
    if (!current) current = piece;
    else if (current.length + 1 + piece.length <= MAX_CHUNK) current += ` ${piece}`;
    else {
      chunks.push(current);
      current = piece;
    }
  };
  for (const sentence of sentences) {
    if (sentence.length <= MAX_CHUNK) {
      push(sentence);
      continue;
    }
    // One very long sentence: break it at commas, then at spaces.
    for (const part of sentence.split(/(?<=[,;:])\s+/)) {
      if (part.length <= MAX_CHUNK) {
        push(part);
        continue;
      }
      let rest = part;
      while (rest.length > MAX_CHUNK) {
        const cut = rest.lastIndexOf(" ", MAX_CHUNK);
        const at = cut > 0 ? cut : MAX_CHUNK;
        push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) push(rest);
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

// About how long the browser takes to say it: people speak roughly 14
// characters a second at the normal rate. Used for a voice note's length and
// its progress bar, since the API doesn't say how long speech will take.
export const estimateSpeechSeconds = (spokenText: string, rate = DEFAULT_RATE): number =>
  spokenText ? Math.max(1, Math.round(spokenText.length / (14 * (rate || DEFAULT_RATE)))) : 0;

export const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// The saved voice, or the closest one this device has: same name (voice URIs
// differ between browsers), then same language, then the browser default.
export const pickVoice = (voices: SpeechSynthesisVoice[], voice?: CharacterVoice): SpeechSynthesisVoice | undefined => {
  if (!voice || voices.length === 0) return undefined;
  if (voice.voiceURI) {
    const exact = voices.find((v) => v.voiceURI === voice.voiceURI);
    if (exact) return exact;
  }
  if (voice.voiceName) {
    const named = voices.find((v) => v.name === voice.voiceName);
    if (named) return named;
  }
  if (voice.lang) {
    const lang = voice.lang.toLowerCase();
    return voices.find((v) => v.lang.toLowerCase() === lang) || voices.find((v) => v.lang.toLowerCase().split("-")[0] === lang.split("-")[0]);
  }
  return undefined;
};

// ---- What's playing ----
// One thing speaks at a time, app-wide, so every speaker button and voice
// note can show whether it's the one playing. `key` is the message id (or
// "preview" for the editor's Preview button).

export interface SpeakingState {
  key: string;
  startedAt: number;
  durationMs: number; // estimated
  spokenChars: number; // how far the browser has got, from boundary events
  totalChars: number;
}

let state: SpeakingState | null = null;
let generation = 0;
const listeners = new Set<() => void>();

const setState = (next: SpeakingState | null) => {
  state = next;
  listeners.forEach((l) => l());
};

export const subscribeSpeaking = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSpeakingState = (): SpeakingState | null => state;

export const stopSpeaking = () => {
  generation++;
  getSynth()?.cancel();
  if (state) setState(null);
};

// Mood-aware voice (#76): a reply's emotion nudges the voice's own rate and
// pitch: slower and softer when sad or shy, quicker and brighter when
// excited. Multipliers on the character's settings, so a deep, slow voice
// stays deep and slow.
const MOOD_TONE: Record<string, { rate: number; pitch: number }> = {
  happy: { rate: 1.05, pitch: 1.08 },
  excited: { rate: 1.15, pitch: 1.12 },
  surprised: { rate: 1.08, pitch: 1.15 },
  flirty: { rate: 0.92, pitch: 1.04 },
  smug: { rate: 0.95, pitch: 0.97 },
  sad: { rate: 0.85, pitch: 0.9 },
  shy: { rate: 0.9, pitch: 1.05 },
  embarrassed: { rate: 0.95, pitch: 1.08 },
  scared: { rate: 1.12, pitch: 1.1 },
  angry: { rate: 1.08, pitch: 0.9 },
  annoyed: { rate: 1.03, pitch: 0.94 },
  thinking: { rate: 0.9, pitch: 0.98 },
};

export const moodTone = (voice: CharacterVoice | undefined, emotion?: string): { rate: number; pitch: number } => {
  const base = { rate: voice?.rate ?? DEFAULT_RATE, pitch: voice?.pitch ?? DEFAULT_PITCH };
  const tone = !voice?.flatTone && emotion ? MOOD_TONE[emotion.toLowerCase()] : undefined;
  if (!tone) return base;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { rate: round(Math.max(0.5, Math.min(2, base.rate * tone.rate))), pitch: round(Math.max(0, Math.min(2, base.pitch * tone.pitch))) };
};

// Speaks `text` (already cleaned with toSpokenText) as `key`, stopping
// whatever was playing. Returns false when there's nothing to say or no
// speech in this browser. `emotion` is the reply's mood, for #76.
export const speak = (key: string, spokenText: string, voice?: CharacterVoice, voices?: SpeechSynthesisVoice[], emotion?: string): boolean => {
  const synth = getSynth();
  stopSpeaking();
  const chunks = splitForSpeech(spokenText);
  if (!synth || chunks.length === 0) return false;

  const mine = ++generation;
  const { rate, pitch } = moodTone(voice, emotion);
  const chosen = pickVoice(voices ?? synth.getVoices(), voice);
  const totalChars = chunks.reduce((n, c) => n + c.length + 1, 0);
  setState({ key, startedAt: Date.now(), durationMs: estimateSpeechSeconds(spokenText, rate) * 1000, spokenChars: 0, totalChars });

  let offset = 0;
  chunks.forEach((chunk, i) => {
    const utterance = new window.SpeechSynthesisUtterance(chunk);
    if (chosen) {
      utterance.voice = chosen;
      utterance.lang = chosen.lang;
    } else if (voice?.lang) {
      utterance.lang = voice.lang;
    }
    utterance.rate = rate;
    utterance.pitch = pitch;
    const start = offset;
    offset += chunk.length + 1;
    const isLast = i === chunks.length - 1;
    utterance.onboundary = (e) => {
      if (mine === generation && state) setState({ ...state, spokenChars: start + (e.charIndex || 0) });
    };
    utterance.onend = () => {
      if (mine !== generation) return;
      if (isLast) setState(null);
      else if (state) setState({ ...state, spokenChars: start + chunk.length + 1 });
    };
    // A cancel (from stopSpeaking) also lands here, as "interrupted" or
    // "canceled", but by then the generation has moved on.
    utterance.onerror = () => {
      if (mine === generation) setState(null);
    };
    synth.speak(utterance);
  });
  return true;
};

// Where a playing item is, 0-1: whichever is further along of the time
// estimate and the browser's own word boundaries (not every voice sends them).
export const speakingProgress = (s: SpeakingState, now = Date.now()): number => {
  const byTime = s.durationMs > 0 ? (now - s.startedAt) / s.durationMs : 0;
  const byWords = s.totalChars > 0 ? s.spokenChars / s.totalChars : 0;
  return Math.min(0.99, Math.max(byTime, byWords, 0));
};
