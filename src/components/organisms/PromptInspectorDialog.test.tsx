import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import PromptInspectorDialog from "./PromptInspectorDialog";
import { clearRequestLog, completeRequest, startRequest } from "src/features/ai/requestLog";

// CRA's Jest can't resolve Radix's package subpath exports, so the dialog
// shell and the Radix-backed Select are swapped for plain elements.
jest.mock("src/components/molecules/Modal", () => ({
  __esModule: true,
  default: ({ isOpen, title, children }: { isOpen: boolean; title: string; children: React.ReactNode }) =>
    isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));
jest.mock("src/components/molecules/form-controls", () => ({
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
}));

const note = "[Out-of-character instructions from the user - follow them, but do not reply to or mention them:\nAuthor's note for the current scene: it rains]";

const logTurn = (reply: string, model = "llama3") => {
  const id = startRequest({
    kind: "chat",
    provider: "ollama",
    model,
    temperature: 0.8,
    samplers: { topP: 0.9 },
    systemInstruction: "You are Kai, a bartender.\n\nPersonality: dry humor",
    history: [{ role: "assistant", text: "Welcome in." }],
    prompt: `A whiskey, please.\n\n${note}`,
  });
  completeRequest(id, reply, { inputTokens: 120, outputTokens: 8, totalTokens: 128 });
  return id;
};

beforeEach(() => clearRequestLog());

describe("PromptInspectorDialog", () => {
  it("says so when nothing has been sent yet", () => {
    render(<PromptInspectorDialog isOpen onClose={jest.fn()} />);
    expect(screen.getByText(/No requests yet/)).toBeInTheDocument();
  });

  it("shows the newest request split into sections, history, prompt, note and reply", () => {
    logTurn("First reply.");
    logTurn("Kai slides a glass over.", "llama3.1");
    render(<PromptInspectorDialog isOpen onClose={jest.fn()} />);

    const sections = within(screen.getByRole("list", { name: "System prompt sections" })).getAllByRole("listitem");
    expect(sections).toHaveLength(2);
    expect(sections[0]).toHaveTextContent("You are Kai, a bartender.");
    expect(sections[1]).toHaveTextContent("Personality: dry humor");
    expect(within(screen.getByRole("list", { name: "History" })).getByText("Welcome in.")).toBeInTheDocument();
    expect(screen.getByLabelText("Final prompt")).toHaveTextContent(/^A whiskey, please\.$/);
    expect(screen.getByLabelText("Post-history note")).toHaveTextContent("it rains");
    expect(screen.getByLabelText("Reply")).toHaveTextContent("Kai slides a glass over.");
    expect(screen.getByText("ollama / llama3.1")).toBeInTheDocument();
    expect(screen.getByText(/120 in, 8 out/)).toBeInTheDocument();
  });

  it("opens on the request behind a given reply", () => {
    logTurn("First reply.");
    logTurn("Second reply.");
    render(<PromptInspectorDialog isOpen onClose={jest.fn()} replyText="First reply." />);
    expect(screen.getByLabelText("Reply")).toHaveTextContent("First reply.");
  });

  it("explains when a reply's request is no longer logged", () => {
    logTurn("Something.");
    render(<PromptInspectorDialog isOpen onClose={jest.fn()} replyText="Long gone." />);
    expect(screen.getByText(/isn't in the log any more/)).toBeInTheDocument();
  });

  it("updates live when the pending reply arrives, and copies the request", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const id = startRequest({ kind: "chat", provider: "ollama", model: "m", history: [], prompt: "Hi" });
    render(<PromptInspectorDialog isOpen onClose={jest.fn()} />);
    expect(screen.getByText("Waiting for the reply…")).toBeInTheDocument();
    act(() => completeRequest(id, "Hello!"));
    expect(screen.getByLabelText("Reply")).toHaveTextContent("Hello!");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("## Reply\nHello!"));
  });
});
