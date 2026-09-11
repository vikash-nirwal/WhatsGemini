// Thin wrapper around the Web Speech API's recognition side (still
// vendor-prefixed as `webkitSpeechRecognition` in Chrome/Edge, and entirely
// absent in Firefox/Safari) so components can feature-detect once and not
// deal with the prefix directly. Backs the composer's mic-dictation input.

const getSpeechRecognitionCtor = (): { new (): SpeechRecognition } | undefined =>
  window.SpeechRecognition || window.webkitSpeechRecognition;

export const isSpeechRecognitionSupported = (): boolean => Boolean(getSpeechRecognitionCtor());

// Continuous + interim results, so the composer can show live partial
// transcripts instead of only committing text once the user stops talking.
export const createSpeechRecognition = (): SpeechRecognition | null => {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";
  return recognition;
};
