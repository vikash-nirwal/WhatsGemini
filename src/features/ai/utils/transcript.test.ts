import { formatTranscript, splitTrailingUserMessages } from "./transcript";
import { AI, YOU } from "../../../utils/constants";

describe("splitTrailingUserMessages", () => {
  it("returns trailing user turns (oldest first) instead of dropping them", () => {
    const { history, trailingText } = splitTrailingUserMessages([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
      { role: "user", text: "first" },
      { role: "user", text: "second" },
    ]);
    expect(history).toEqual([{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }]);
    expect(trailingText).toBe("first\n\nsecond");
  });

  it("does not mutate its input", () => {
    const input = [{ role: "user" as const, text: "x" }];
    splitTrailingUserMessages(input);
    expect(input).toHaveLength(1);
  });
});

describe("formatTranscript", () => {
  it("labels lines with real names and skips hidden priming messages", () => {
    const text = formatTranscript(
      [
        { role: YOU, txt: "hi" },
        { role: AI, txt: "ignored", isSystem: true },
        { role: AI, txt: "hello", speakerId: 2 },
        { role: AI, txt: "hey" },
      ],
      { userName: "Arin", charName: "Mira", speakerNames: { 2: "Beck" } }
    );
    expect(text).toBe("Arin: hi\n\nBeck: hello\n\nMira: hey");
  });
});
