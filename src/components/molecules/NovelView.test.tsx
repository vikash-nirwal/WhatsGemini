import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { NovelMessageItem } from "./NovelMessageItem";
import { NovelChoicesView } from "./NovelChoicesView";
import { Character, Message } from "../../types";
import { AI, YOU } from "../../utils/constants";

jest.mock("./MarkdownRenderer", () => {
  return function MockMarkdownRenderer({ msgText }: { msgText: string }) {
    return <div data-testid="markdown">{typeof msgText === "string" ? msgText : JSON.stringify(msgText)}</div>;
  };
});

jest.mock("./CharacterAvatar", () => ({
  CharacterAvatar: ({ name }: { name: string }) => <div data-testid="character-avatar">{name}</div>,
}));

describe("NovelMessageItem", () => {
  const dummyCast: Character[] = [
    { id: 1, name: "Mira", description: "Rogue", prompt: "" },
  ];

  it("renders player action with 'Choice Taken' badge when chosenChoiceId is set", () => {
    const msg: Message = {
      role: YOU,
      txt: "I open the chest.",
      chosenChoiceId: "c1",
    };
    render(
      <NovelMessageItem
        msg={msg}
        index={1}
        cast={dummyCast}
        illustrating={false}
        onIllustrate={jest.fn()}
        onImageClick={jest.fn()}
        fontFamily="serif"
        fontSize="base"
      />
    );
    expect(screen.getByText("Choice Taken")).toBeInTheDocument();
    expect(screen.getByText(/I open the chest\./)).toBeInTheDocument();
  });

  it("renders player action with 'Player Action' badge when custom typed", () => {
    const msg: Message = {
      role: YOU,
      txt: "I cast a light spell.",
    };
    render(
      <NovelMessageItem
        msg={msg}
        index={1}
        cast={dummyCast}
        illustrating={false}
        onIllustrate={jest.fn()}
        onImageClick={jest.fn()}
        fontFamily="serif"
        fontSize="base"
      />
    );
    expect(screen.getByText("Player Action")).toBeInTheDocument();
    expect(screen.getByText(/I cast a light spell\./)).toBeInTheDocument();
  });

  it("renders narrator turns with character reaction badges", () => {
    const msg: Message = {
      id: "m1",
      role: AI,
      txt: "The chamber echoes with ancient whispers.",
      castEmotions: { 1: "nervous" },
    };
    render(
      <NovelMessageItem
        msg={msg}
        index={0}
        cast={dummyCast}
        illustrating={false}
        onIllustrate={jest.fn()}
        onImageClick={jest.fn()}
        isFirstNarratorTurn={true}
        fontFamily="serif"
        fontSize="lg"
      />
    );
    expect(screen.getByText(/The chamber echoes with ancient whispers\./)).toBeInTheDocument();
    expect(screen.getAllByText("Mira").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("(nervous)")).toBeInTheDocument();
  });
});

describe("NovelChoicesView", () => {
  const choices = [
    { id: "c1", label: "Inspect the altar" },
    { id: "c2", label: "Retreat to the shadows" },
  ];

  it("renders choices with Roman numerals and triggers onSelectChoice", () => {
    const handleSelect = jest.fn();
    render(
      <NovelChoicesView
        choices={choices}
        onSelectChoice={handleSelect}
        inputText=""
        setInputText={jest.fn()}
        onSend={jest.fn()}
        generating={false}
        imageRequested={false}
        setImageRequested={jest.fn()}
        fontFamily="serif"
      />
    );

    expect(screen.getByText("Inspect the altar")).toBeInTheDocument();
    expect(screen.getByText("Retreat to the shadows")).toBeInTheDocument();
    expect(screen.getByText("I")).toBeInTheDocument();
    expect(screen.getByText("II")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Inspect the altar"));
    expect(handleSelect).toHaveBeenCalledWith("Inspect the altar", "c1");
  });

  it("triggers onSend when custom action is submitted", () => {
    const handleSend = jest.fn();
    render(
      <NovelChoicesView
        choices={choices}
        onSelectChoice={jest.fn()}
        inputText="I look for a hidden lever"
        setInputText={jest.fn()}
        onSend={handleSend}
        generating={false}
        imageRequested={false}
        setImageRequested={jest.fn()}
        fontFamily="serif"
      />
    );

    const sendBtn = screen.getByRole("button", { name: /send action/i });
    fireEvent.click(sendBtn);
    expect(handleSend).toHaveBeenCalledWith("I look for a hidden lever");
  });
});
