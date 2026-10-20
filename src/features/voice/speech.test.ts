import { estimateSpeechSeconds, formatDuration, getSpeakingState, isSpeechSupported, pickVoice, speak, speakingProgress, splitForSpeech, stopSpeaking, subscribeSpeaking, toSpokenText } from "./speech";
import { FAKE_VOICES, FakeUtterance, installFakeSynth, uninstallFakeSynth } from "./fakeSpeech";

afterEach(() => {
  stopSpeaking();
  uninstallFakeSynth();
});

describe("toSpokenText", () => {
  it("leaves out *actions* and keeps the spoken words", () => {
    expect(toSpokenText('*She leans closer.* "I missed you." *smiles* Really.')).toBe('"I missed you." Really.');
  });

  it("drops control tags, the image-context tag and thoughts", () => {
    const text = "[React: ❤️] [Emotion: happy] Hello there!\n<thoughts>He looks tired.</thoughts>\n\n[Image Context: a cafe at night]";
    expect(toSpokenText(text)).toBe("Hello there!");
  });

  it("drops a trailing emotion tag", () => {
    expect(toSpokenText("See you soon. [Emotion: sad]")).toBe("See you soon.");
  });

  it("keeps the words of bold text and links, but not markdown symbols, URLs or emoji", () => {
    expect(toSpokenText("# Title\n- **Really** look at [this](https://x.y) 😍 https://example.com ok")).toBe("Title Really look at this ok");
  });

  it("is empty for a reply that's only an action", () => {
    expect(toSpokenText("*waves*")).toBe("");
  });
});

describe("splitForSpeech", () => {
  it("keeps short text as one piece", () => {
    expect(splitForSpeech("Hi. How are you?")).toEqual(["Hi. How are you?"]);
  });

  it("splits long text at sentence ends into pieces of at most 200 characters", () => {
    const sentence = "This sentence is exactly fifty characters long ok.";
    const chunks = splitForSpeech(Array(9).fill(sentence).join(" "));
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(200));
    expect(chunks.join(" ")).toBe(Array(9).fill(sentence).join(" "));
  });

  it("breaks one very long sentence at spaces", () => {
    const words = Array(80).fill("word").join(" ");
    const chunks = splitForSpeech(words);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(200));
    expect(chunks.join(" ")).toBe(words);
  });
});

describe("durations", () => {
  it("estimates about 14 characters a second, faster at a higher rate", () => {
    expect(estimateSpeechSeconds("x".repeat(140))).toBe(10);
    expect(estimateSpeechSeconds("x".repeat(140), 2)).toBe(5);
    expect(estimateSpeechSeconds("hi")).toBe(1);
    expect(estimateSpeechSeconds("")).toBe(0);
  });

  it("formats as m:ss", () => {
    expect(formatDuration(7)).toBe("0:07");
    expect(formatDuration(75)).toBe("1:15");
  });
});

describe("pickVoice", () => {
  it("finds the saved voice, then the same name, then the same language", () => {
    expect(pickVoice(FAKE_VOICES, { voiceURI: "voice-bruno" })?.name).toBe("Bruno");
    expect(pickVoice(FAKE_VOICES, { voiceURI: "elsewhere", voiceName: "Alice" })?.name).toBe("Alice");
    expect(pickVoice(FAKE_VOICES, { voiceURI: "elsewhere", lang: "pt-PT" })?.name).toBe("Bruno");
  });

  it("leaves it to the browser default when nothing matches or nothing was picked", () => {
    expect(pickVoice(FAKE_VOICES, { voiceURI: "elsewhere", lang: "ja-JP" })).toBeUndefined();
    expect(pickVoice(FAKE_VOICES, undefined)).toBeUndefined();
    expect(pickVoice([], { voiceURI: "voice-alice" })).toBeUndefined();
  });
});

describe("speak", () => {
  it("does nothing where the browser has no speech", () => {
    expect(isSpeechSupported()).toBe(false);
    expect(speak("m1", "Hello")).toBe(false);
    expect(getSpeakingState()).toBeNull();
  });

  it("speaks with the character's voice, rate and pitch, and clears when done", () => {
    const fake = installFakeSynth();
    const listener = jest.fn();
    const unsubscribe = subscribeSpeaking(listener);
    expect(speak("m1", "Hello there.", { voiceURI: "voice-bruno", rate: 1.5, pitch: 0.8 })).toBe(true);
    expect(getSpeakingState()?.key).toBe("m1");
    const u = fake.spoken[0] as FakeUtterance;
    expect(u.text).toBe("Hello there.");
    expect(u.voice?.name).toBe("Bruno");
    expect(u.lang).toBe("pt-BR");
    expect(u.rate).toBe(1.5);
    expect(u.pitch).toBe(0.8);
    fake.finishAll();
    expect(getSpeakingState()).toBeNull();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("queues long text as several pieces and only finishes after the last", () => {
    const fake = installFakeSynth();
    const sentence = "This sentence is exactly fifty characters long ok.";
    speak("m1", Array(9).fill(sentence).join(" "));
    expect(fake.spoken.length).toBeGreaterThan(1);
    fake.finishNext();
    expect(getSpeakingState()?.key).toBe("m1");
    expect(getSpeakingState()!.spokenChars).toBeGreaterThan(0);
    fake.finishAll();
    expect(getSpeakingState()).toBeNull();
  });

  it("stops the previous item when another starts, and on stopSpeaking", () => {
    installFakeSynth();
    speak("m1", "One.");
    speak("m2", "Two.");
    expect(getSpeakingState()?.key).toBe("m2");
    stopSpeaking();
    expect(getSpeakingState()).toBeNull();
  });

  it("says nothing for empty text", () => {
    const fake = installFakeSynth();
    expect(speak("m1", "")).toBe(false);
    expect(fake.spoken).toHaveLength(0);
  });
});

describe("speakingProgress", () => {
  it("uses whichever of time and word boundaries is further, below 1", () => {
    const s = { key: "m", startedAt: 1000, durationMs: 10_000, spokenChars: 0, totalChars: 100 };
    expect(speakingProgress(s, 6000)).toBeCloseTo(0.5);
    expect(speakingProgress({ ...s, spokenChars: 80 }, 6000)).toBeCloseTo(0.8);
    expect(speakingProgress(s, 60_000)).toBe(0.99);
  });
});
