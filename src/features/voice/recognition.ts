// Speech-to-text (#12, #44) with the browser's SpeechRecognition, for
// dictating into the composer and recording voice notes. Chrome, Edge and
// Safari have it (Chrome sends the audio to Google to transcribe); Firefox
// doesn't, so every caller checks isRecognitionSupported first and hides
// the controls where it's missing.

// The parts of the API used here. TypeScript's DOM types don't include it.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
export interface RecognitionResultEvent {
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  readonly error: string;
}
export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

export const getRecognitionCtor = (): RecognitionCtor | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};

export const isRecognitionSupported = (): boolean => Boolean(getRecognitionCtor());

// The whole transcript so far, rebuilt from every result each time: Chrome
// on Android repeats earlier text in later results, so appending only the
// newest ones duplicates words there.
export const readTranscript = (e: RecognitionResultEvent): { final: string; interim: string } => {
  const finals: string[] = [];
  const interims: string[] = [];
  for (let i = 0; i < e.results.length; i++) {
    const result = e.results[i];
    const text = result[0]?.transcript?.trim();
    if (!text) continue;
    (result.isFinal ? finals : interims).push(text);
  }
  return { final: finals.join(" "), interim: interims.join(" ") };
};

export const describeRecognitionError = (code: string): string | null => {
  switch (code) {
    case "aborted":
      return null;
    case "no-speech":
      return "Didn't hear anything. Try again a little closer to the microphone.";
    case "audio-capture":
      return "No microphone was found.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow it in the browser's site settings (on iPhone, Siri and dictation must be on too).";
    case "network":
      return "Speech recognition needs an internet connection in this browser.";
    case "language-not-supported":
      return "Speech recognition doesn't support this language here.";
    default:
      return "Speech recognition stopped unexpectedly.";
  }
};

export interface RecognitionHandlers {
  onUpdate: (final: string, interim: string) => void;
  // Always called once, with the final transcript and any error message.
  onEnd: (text: string, error?: string) => void;
}

export interface RecognitionSession {
  stop: () => void; // finish and keep what was heard
  abort: () => void; // finish and throw it away
}

// Starts listening until stop() or abort(). Returns null where the browser
// has no speech recognition or refuses to start.
export const startRecognition = ({ onUpdate, onEnd }: RecognitionHandlers): RecognitionSession | null => {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  let recognition: SpeechRecognitionLike;
  try {
    recognition = new Ctor();
  } catch {
    return null;
  }
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";

  let heard = { final: "", interim: "" };
  let error: string | undefined;
  let aborted = false;
  let ended = false;
  recognition.onresult = (e) => {
    heard = readTranscript(e);
    onUpdate(heard.final, heard.interim);
  };
  recognition.onerror = (e) => {
    error = describeRecognitionError(e.error) ?? undefined;
  };
  recognition.onend = () => {
    if (ended) return;
    ended = true;
    // Words still marked interim when listening stopped are kept: Safari
    // often never marks the last phrase final.
    const text = aborted ? "" : [heard.final, heard.interim].filter(Boolean).join(" ");
    onEnd(text, aborted ? undefined : error);
  };
  try {
    recognition.start();
  } catch {
    return null;
  }
  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        recognition.onend?.();
      }
    },
    abort: () => {
      aborted = true;
      try {
        recognition.abort();
      } catch {
        recognition.onend?.();
      }
    },
  };
};
