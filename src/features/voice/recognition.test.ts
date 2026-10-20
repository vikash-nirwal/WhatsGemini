import { describeRecognitionError, isRecognitionSupported, readTranscript, startRecognition } from "./recognition";
import { installFakeRecognition, uninstallFakeRecognition } from "./fakeSpeech";

afterEach(uninstallFakeRecognition);

describe("isRecognitionSupported", () => {
  it("is false without the API (Firefox, jsdom) and true with the webkit one", () => {
    expect(isRecognitionSupported()).toBe(false);
    installFakeRecognition();
    expect(isRecognitionSupported()).toBe(true);
  });
});

describe("readTranscript", () => {
  it("joins final and interim results separately", () => {
    const results = [Object.assign([{ transcript: " hello " }], { isFinal: true }), Object.assign([{ transcript: "there" }], { isFinal: false })];
    expect(readTranscript({ results } as any)).toEqual({ final: "hello", interim: "there" });
  });
});

describe("startRecognition", () => {
  it("returns null where there is no recognition", () => {
    expect(startRecognition({ onUpdate: jest.fn(), onEnd: jest.fn() })).toBeNull();
  });

  it("listens continuously with interim results and reports what was heard on stop", () => {
    const latest = installFakeRecognition();
    const onUpdate = jest.fn();
    const onEnd = jest.fn();
    const session = startRecognition({ onUpdate, onEnd })!;
    const rec = latest();
    expect(rec.started).toBe(true);
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    rec.hear(["I'm on my way", "see you"], false);
    expect(onUpdate).toHaveBeenLastCalledWith("I'm on my way", "see you");
    session.stop();
    // Words still interim when it stopped are kept.
    expect(onEnd).toHaveBeenCalledWith("I'm on my way see you", undefined);
  });

  it("throws away what was heard on abort", () => {
    const latest = installFakeRecognition();
    const onEnd = jest.fn();
    const session = startRecognition({ onUpdate: jest.fn(), onEnd })!;
    latest().hear(["never mind"]);
    session.abort();
    expect(onEnd).toHaveBeenCalledWith("", undefined);
  });

  it("passes on a readable error", () => {
    const latest = installFakeRecognition();
    const onEnd = jest.fn();
    startRecognition({ onUpdate: jest.fn(), onEnd });
    latest().fail("not-allowed");
    expect(onEnd).toHaveBeenCalledWith("", expect.stringContaining("Microphone access is blocked"));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("describeRecognitionError", () => {
  it("stays quiet about an abort and explains the rest", () => {
    expect(describeRecognitionError("aborted")).toBeNull();
    expect(describeRecognitionError("no-speech")).toMatch(/Didn't hear anything/);
    expect(describeRecognitionError("network")).toMatch(/internet/);
    expect(describeRecognitionError("something-new")).toMatch(/stopped/);
  });
});
