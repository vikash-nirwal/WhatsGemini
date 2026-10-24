import { buildQuoteDirective, extractReplyQuote, findQuotedMessage, quoteTextOf, stripStreamingReplyQuote } from "./replyQuotes";
import { Message } from "../../types";

const msg = (role: "you" | "ai", txt: string, extra: Partial<Message> = {}): Message => ({ role, txt, id: txt, timestamp: 1, ...extra } as Message);

describe("quoted replies (#119)", () => {
  it("reads a character's quote tag at the start of a reply", () => {
    expect(extractReplyQuote("[Re: the blue dress] Honestly? Wear it.")).toEqual({ text: "Honestly? Wear it.", quote: "the blue dress" });
    expect(extractReplyQuote("No tag here [Re: x]")).toEqual({ text: "No tag here [Re: x]" });
  });

  it("hides the tag while it streams in", () => {
    expect(stripStreamingReplyQuote("[Re: the bl")).toBe("");
    expect(stripStreamingReplyQuote("[Re: the blue dress] Hones")).toBe("Hones");
    expect(stripStreamingReplyQuote("Hello")).toBe("Hello");
  });

  it("finds the message of yours it quotes", () => {
    const messages = [msg("you", "Should I wear the blue dress tonight?"), msg("ai", "Hmm"), msg("you", "Also, dinner at 8?")];
    expect(findQuotedMessage(messages, "the blue dress")?.id).toBe("Should I wear the blue dress tonight?");
    expect(findQuotedMessage(messages, "dinner at eight 8")?.id).toBe("Also, dinner at 8?");
    expect(findQuotedMessage(messages, "something else entirely")).toBeUndefined();
  });

  it("says what a quoted message was", () => {
    expect(quoteTextOf({ txt: "", images: ["x"] })).toBe("📷 Photo");
    expect(quoteTextOf({ txt: "hi", isVoiceNote: true })).toBe("🎤 Voice message");
    expect(quoteTextOf({ txt: "hey [Image Context: a cafe]" })).toBe("hey");
    expect(buildQuoteDirective("Aria", "Sam")).toContain("start it with [Re: a few exact words");
  });
});
