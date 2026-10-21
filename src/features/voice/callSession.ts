// Phone calls (#56): a hands-free voice conversation with a character, built
// on the browser's free speech recognition and speech synthesis (#12). The
// loop is: listen, and after a short silence send what was heard; wait for
// the reply; speak it in the character's voice; listen again.

// How long a pause ends what the user is saying.
export const CALL_SILENCE_MS = 1400;

export type CallPhase = "listening" | "thinking" | "speaking" | "muted" | "unavailable";

// Sent with every reply while a call is on, so the character talks rather
// than writes.
export const buildCallSection = (charName: string): string =>
  `You're on a voice call with the user right now, and your reply is spoken aloud. Talk the way ${charName} would on the phone: short, natural sentences (one to three), no *actions* or narration, no emojis, no lists or formatting. React to what they just said; it's fine to ask something back.`;

export const formatCallTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

export const callStatusText = (phase: CallPhase, charName: string): string =>
  ({
    listening: "Listening...",
    thinking: `${charName} is thinking...`,
    speaking: `${charName} is talking`,
    muted: "You're muted",
    unavailable: "This browser can't listen or speak, so calls don't work here.",
  })[phase];
