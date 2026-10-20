import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { VoiceNote } from "./VoiceNote";
import { stopSpeaking } from "src/features/voice/speech";
import { installFakeSynth, uninstallFakeSynth } from "src/features/voice/fakeSpeech";

jest.mock("./MarkdownRenderer", () => {
  return function MockMarkdownRenderer({ msgText }: { msgText: string }) {
    return <div data-testid="transcript">{msgText}</div>;
  };
});

afterEach(() => {
  act(() => stopSpeaking());
  uninstallFakeSynth();
});

const TEXT = "*giggles* Okay, okay. I'll be there at eight.";

describe("VoiceNote", () => {
  it("shows its length and keeps the transcript behind a toggle", () => {
    installFakeSynth();
    render(<VoiceNote id="m1" text={TEXT} />);
    expect(screen.getByRole("group", { name: /Voice note, 0:0\d/ })).toBeInTheDocument();
    expect(screen.queryByTestId("transcript")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show transcript" }));
    expect(screen.getByTestId("transcript")).toHaveTextContent(TEXT);
    expect(screen.getByRole("button", { name: "Hide transcript" })).toHaveAttribute("aria-expanded", "true");
  });

  it("plays with the character's voice, without the actions, and stops", () => {
    const fake = installFakeSynth();
    render(<VoiceNote id="m1" text={TEXT} voice={{ voiceURI: "voice-alice", rate: 1.2 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Play voice note" }));
    expect(fake.spoken[0].text).toBe("Okay, okay. I'll be there at eight.");
    expect(fake.spoken[0].voice?.name).toBe("Alice");
    expect(fake.spoken[0].rate).toBe(1.2);
    fireEvent.click(screen.getByRole("button", { name: "Stop voice note" }));
    expect(screen.getByRole("button", { name: "Play voice note" })).toBeInTheDocument();
  });

  it("turns back into a play button when it finishes", () => {
    const fake = installFakeSynth();
    render(<VoiceNote id="m1" text={TEXT} />);
    fireEvent.click(screen.getByRole("button", { name: "Play voice note" }));
    act(() => fake.finishAll());
    expect(screen.getByRole("button", { name: "Play voice note" })).toBeInTheDocument();
  });

  it("only one note plays at a time", () => {
    installFakeSynth();
    render(
      <>
        <VoiceNote id="m1" text="First." />
        <VoiceNote id="m2" text="Second." />
      </>
    );
    const [first, second] = screen.getAllByRole("button", { name: "Play voice note" });
    fireEvent.click(first);
    fireEvent.click(second);
    expect(screen.getAllByRole("button", { name: "Play voice note" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Stop voice note" })).toHaveLength(1);
  });

  it("shows the transcript where the browser can't speak", () => {
    render(<VoiceNote id="m1" text={TEXT} />);
    expect(screen.getByRole("button", { name: "Play voice note" })).toBeDisabled();
    expect(screen.getByTestId("transcript")).toBeInTheDocument();
    expect(screen.getByText("This browser can't play voice notes aloud.")).toBeInTheDocument();
  });
});
