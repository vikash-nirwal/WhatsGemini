import { fitsVoiceNote, markVoiceNote, MAX_VOICE_NOTE_CHARS, promptTextFor, rollVoiceNote, waveformBars } from "./voiceNotes";

describe("rollVoiceNote", () => {
  const always = () => 0;
  const never = () => 0.99;

  it("never happens when off or unset", () => {
    expect(rollVoiceNote(undefined, { random: always, speechSupported: true })).toBe(false);
    expect(rollVoiceNote({ voiceNotes: "off" }, { random: always, speechSupported: true })).toBe(false);
  });

  it("follows the chance for sometimes and often", () => {
    expect(rollVoiceNote({ voiceNotes: "sometimes" }, { random: () => 0.1, speechSupported: true })).toBe(true);
    expect(rollVoiceNote({ voiceNotes: "sometimes" }, { random: () => 0.2, speechSupported: true })).toBe(false);
    expect(rollVoiceNote({ voiceNotes: "often" }, { random: () => 0.3, speechSupported: true })).toBe(true);
    expect(rollVoiceNote({ voiceNotes: "often" }, { random: never, speechSupported: true })).toBe(false);
  });

  it("never comes with a picture or video, or where it couldn't be played", () => {
    expect(rollVoiceNote({ voiceNotes: "often" }, { random: always, speechSupported: true, mediaRequest: true })).toBe(false);
    expect(rollVoiceNote({ voiceNotes: "often" }, { random: always, speechSupported: false })).toBe(false);
  });
});

describe("fitsVoiceNote", () => {
  it("takes a short spoken reply", () => {
    expect(fitsVoiceNote({ text: "*laughs* okay, okay, you win." })).toBe(true);
  });

  it("refuses replies with nothing to say, too much, media, or a refusal", () => {
    expect(fitsVoiceNote({ text: "*waves*" })).toBe(false);
    expect(fitsVoiceNote({ text: "a".repeat(MAX_VOICE_NOTE_CHARS + 1) })).toBe(false);
    expect(fitsVoiceNote({ text: "Look!", images: ["data:image/png;base64,x"] })).toBe(false);
    expect(fitsVoiceNote({ text: "Look!", videos: ["v"] })).toBe(false);
    expect(fitsVoiceNote({ text: "I can't continue this.", isRefusal: true })).toBe(false);
  });
});

describe("promptTextFor", () => {
  it("marks your voice notes and leaves everything else alone", () => {
    expect(promptTextFor({ role: "you", txt: "on my way", isVoiceNote: true })).toBe("(voice note) on my way");
    expect(markVoiceNote("hi")).toBe("(voice note) hi");
    expect(promptTextFor({ role: "you", txt: "typed" })).toBe("typed");
    expect(promptTextFor({ role: "ai", txt: "their note", isVoiceNote: true })).toBe("their note");
  });
});

describe("waveformBars", () => {
  it("is the same for the same message and differs between messages", () => {
    const a = waveformBars("msg-a");
    expect(a).toHaveLength(28);
    expect(waveformBars("msg-a")).toEqual(a);
    expect(waveformBars("msg-b")).not.toEqual(a);
    a.forEach((h) => {
      expect(h).toBeGreaterThanOrEqual(0.25);
      expect(h).toBeLessThanOrEqual(1);
    });
  });
});
