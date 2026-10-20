import React, { useState } from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import VoiceSection, { cleanVoice } from "./VoiceSection";
import { CharacterVoice } from "src/types";
import { stopSpeaking } from "src/features/voice/speech";
import { installFakeSynth, uninstallFakeSynth } from "src/features/voice/fakeSpeech";

// Radix's Select can't be driven in jsdom; a native one has the same API.
jest.mock("src/components/molecules/form-controls", () => ({
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
}));

afterEach(() => {
  act(() => stopSpeaking());
  uninstallFakeSynth();
});

const Harness = ({ initial, onChange }: { initial?: CharacterVoice; onChange?: (v: CharacterVoice | undefined) => void }) => {
  const [voice, setVoice] = useState<CharacterVoice | undefined>(initial);
  return (
    <VoiceSection
      name="Mira"
      value={voice}
      onChange={(v) => {
        setVoice(v);
        onChange?.(v);
      }}
    />
  );
};

describe("VoiceSection", () => {
  it("picks a voice, speed, pitch and voice-note frequency", () => {
    installFakeSynth();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Voice" }), { target: { value: "voice-bruno" } });
    fireEvent.change(screen.getByRole("slider", { name: "Speed" }), { target: { value: "1.4" } });
    fireEvent.change(screen.getByRole("slider", { name: "Pitch" }), { target: { value: "0.6" } });
    fireEvent.click(screen.getByRole("button", { name: "Often" }));
    expect(onChange).toHaveBeenLastCalledWith({ voiceURI: "voice-bruno", voiceName: "Bruno", lang: "pt-BR", rate: 1.4, pitch: 0.6, voiceNotes: "often" });
    expect(screen.getByRole("button", { name: "Often" })).toHaveAttribute("aria-pressed", "true");
  });

  it("previews the voice and stops the preview", () => {
    const fake = installFakeSynth();
    render(<Harness initial={{ voiceURI: "voice-alice", pitch: 1.5 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(fake.spoken[0].text).toBe("Hi, I'm Mira. This is how I sound.");
    expect(fake.spoken[0].voice?.name).toBe("Alice");
    expect(fake.spoken[0].pitch).toBe(1.5);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("keeps a voice saved on another device selectable", () => {
    installFakeSynth();
    render(<Harness initial={{ voiceURI: "elsewhere", voiceName: "Samantha", lang: "en-US" }} />);
    expect(screen.getByRole("option", { name: "Samantha (not on this device)" })).toBeInTheDocument();
  });

  it("copes with a browser that has no voices", () => {
    jest.useFakeTimers();
    installFakeSynth([]);
    render(<Harness />);
    expect(screen.getByText("Loading voices...")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText(/No voices found in this browser/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Voice" })).toBeDisabled();
    jest.useRealTimers();
  });

  it("explains a browser without speech and disables Preview", () => {
    render(<Harness />);
    expect(screen.getByText(/This browser can't read text aloud/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
  });
});

describe("cleanVoice", () => {
  it("drops defaults and an all-default voice", () => {
    expect(cleanVoice(undefined)).toBeUndefined();
    expect(cleanVoice({ rate: 1, pitch: 1, voiceNotes: "off" })).toBeUndefined();
    expect(cleanVoice({ voiceURI: "", voiceName: "x", rate: 1.2 })).toEqual({ rate: 1.2 });
    expect(cleanVoice({ voiceURI: "u", voiceName: "U", lang: "en", voiceNotes: "sometimes" })).toEqual({ voiceURI: "u", voiceName: "U", lang: "en", voiceNotes: "sometimes" });
  });
});
