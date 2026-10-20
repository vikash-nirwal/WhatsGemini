// Test-only stand-ins for the Web Speech API, which jsdom doesn't have. Not
// imported by the app.

export class FakeUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  lang = "";
  rate = 1;
  pitch = 1;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onboundary: ((e: { charIndex: number }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

export const FAKE_VOICES = [
  { name: "Alice", voiceURI: "voice-alice", lang: "en-US", default: true, localService: true },
  { name: "Bruno", voiceURI: "voice-bruno", lang: "pt-BR", default: false, localService: true },
] as unknown as SpeechSynthesisVoice[];

// Utterances queue up and only finish when the test says so.
export const installFakeSynth = (voices: SpeechSynthesisVoice[] = FAKE_VOICES) => {
  const queue: FakeUtterance[] = [];
  const spoken: FakeUtterance[] = [];
  const synth = {
    getVoices: () => voices,
    speak: (u: FakeUtterance) => {
      queue.push(u);
      spoken.push(u);
    },
    cancel: () => {
      queue.splice(0).forEach((u) => u.onerror?.({ error: "interrupted" }));
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  (window as any).SpeechSynthesisUtterance = FakeUtterance;
  return {
    synth,
    spoken,
    queue,
    finishNext: () => queue.shift()?.onend?.(),
    finishAll: () => {
      while (queue.length) queue.shift()?.onend?.();
    },
  };
};

export const uninstallFakeSynth = () => {
  delete (window as any).speechSynthesis;
  delete (window as any).SpeechSynthesisUtterance;
};

// A SpeechRecognition that reports whatever the test makes it "hear".
export class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = "";
  started = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.started = false;
    this.onend?.();
  }
  // Each phrase is one result; the last can be left interim.
  hear(phrases: string[], lastIsFinal = true) {
    const results = phrases.map((p, i) => Object.assign([{ transcript: p }], { isFinal: i < phrases.length - 1 || lastIsFinal }));
    this.onresult?.({ results });
  }
  fail(error: string) {
    this.onerror?.({ error });
    this.started = false;
    this.onend?.();
  }
}

export const installFakeRecognition = () => {
  FakeRecognition.instances = [];
  (window as any).webkitSpeechRecognition = FakeRecognition;
  return () => FakeRecognition.instances[FakeRecognition.instances.length - 1];
};

export const uninstallFakeRecognition = () => {
  delete (window as any).webkitSpeechRecognition;
  delete (window as any).SpeechRecognition;
};
