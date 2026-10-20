import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import MessageInput from "./MessageInput";
import { FakeRecognition, installFakeRecognition, uninstallFakeRecognition } from "src/features/voice/fakeSpeech";

// Voice in the composer (#12, #44): dictation and hold-to-record, with a
// fake SpeechRecognition (jsdom has none, like Firefox).

// CRA's Jest can't resolve Radix's package subpath exports (the avatar's).
jest.mock("src/components/molecules/CharacterAvatar", () => ({
  CharacterAvatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

// The provider registry (for the video toggle) pulls in ESM-only SDKs.
jest.mock("src/features/ai/providers/registry", () => ({ VIDEO_PROVIDERS: {} }));
jest.mock("src/features/ai/utils/settings", () => ({ getProviderApiKey: async () => "", getWanBaseUrl: () => "" }));

afterEach(uninstallFakeRecognition);

const recordButton = () => screen.getByRole("button", { name: "Hold to record a voice note" });

describe("MessageInput voice", () => {
  it("shows no dictation or record button without speech recognition", () => {
    render(<MessageInput onSend={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "Dictate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hold to record a voice note" })).not.toBeInTheDocument();
  });

  it("dictates into the box, after what was already typed", () => {
    const latest = installFakeRecognition();
    render(<MessageInput onSend={jest.fn()} />);
    const input = screen.getByLabelText("Message input");
    fireEvent.change(input, { target: { value: "Hey," } });
    fireEvent.click(screen.getAllByRole("button", { name: "Dictate" })[0]);
    expect(screen.getByText("Listening — speak and your words appear in the box.")).toBeInTheDocument();
    act(() => latest().hear(["how are you"], false));
    expect(input).toHaveValue("Hey, how are you");
    act(() => {
      latest().hear(["how are you doing"]);
      latest().stop();
    });
    expect(input).toHaveValue("Hey, how are you doing");
    expect(screen.queryByText(/Listening/)).not.toBeInTheDocument();
  });

  it("sends what was said while holding as a voice note", () => {
    const latest = installFakeRecognition();
    const onSend = jest.fn();
    render(<MessageInput onSend={onSend} />);
    fireEvent.pointerDown(recordButton(), { button: 0, pointerId: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("Recording a voice note");
    act(() => latest().hear(["running late, sorry"]));
    expect(screen.getByRole("status")).toHaveTextContent("running late, sorry");
    act(() => {
      fireEvent.pointerUp(screen.getByRole("button", { name: "Recording voice note, let go to send" }), { pointerId: 1 });
    });
    expect(onSend).toHaveBeenCalledWith("running late, sorry", false, false, false, undefined, false, true);
  });

  it("records with Space held down too", () => {
    const latest = installFakeRecognition();
    const onSend = jest.fn();
    render(<MessageInput onSend={onSend} />);
    fireEvent.keyDown(recordButton(), { key: " " });
    act(() => latest().hear(["hello"]));
    act(() => {
      fireEvent.keyUp(screen.getByRole("button", { name: "Recording voice note, let go to send" }), { key: " " });
    });
    expect(onSend).toHaveBeenCalledWith("hello", false, false, false, undefined, false, true);
  });

  it("cancels when Escape is pressed or the pointer is cancelled", () => {
    const latest = installFakeRecognition();
    const onSend = jest.fn();
    render(<MessageInput onSend={onSend} />);
    fireEvent.keyDown(recordButton(), { key: "Enter" });
    act(() => latest().hear(["oops"]));
    act(() => {
      fireEvent.keyDown(screen.getByRole("button", { name: "Recording voice note, let go to send" }), { key: "Escape" });
    });
    fireEvent.pointerDown(recordButton(), { button: 0, pointerId: 2 });
    act(() => latest().hear(["oops again"]));
    act(() => {
      fireEvent.pointerCancel(screen.getByRole("button", { name: "Recording voice note, let go to send" }), { pointerId: 2 });
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it("explains a quick tap instead of sending nothing", () => {
    installFakeRecognition();
    const onSend = jest.fn();
    render(<MessageInput onSend={onSend} />);
    fireEvent.pointerDown(recordButton(), { button: 0, pointerId: 1 });
    act(() => {
      fireEvent.pointerUp(screen.getByRole("button", { name: "Recording voice note, let go to send" }), { pointerId: 1 });
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Hold the button while you speak, then let go to send.");
  });

  it("shows a blocked microphone as an error", () => {
    const latest = installFakeRecognition();
    render(<MessageInput onSend={jest.fn()} />);
    fireEvent.pointerDown(recordButton(), { button: 0, pointerId: 1 });
    act(() => latest().fail("not-allowed"));
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access is blocked");
  });

  it("hides the record button while there's text to send", () => {
    installFakeRecognition();
    render(<MessageInput onSend={jest.fn()} />);
    fireEvent.change(screen.getByLabelText("Message input"), { target: { value: "typed" } });
    expect(screen.queryByRole("button", { name: "Hold to record a voice note" })).not.toBeInTheDocument();
  });
});
