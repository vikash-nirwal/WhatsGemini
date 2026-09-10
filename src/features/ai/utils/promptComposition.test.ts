import { buildChatHistory, buildSystemInstruction } from "./promptComposition";
import { YOU, AI } from "../../../utils/constants";
import { Character, Message } from "../../../types";

const msg = (role: string, txt: string, speakerId?: number): Message => ({ role, txt, speakerId });

const makeCharacter = (overrides: Partial<Character> = {}): Character => ({
  id: 1,
  name: "Aria",
  description: "A test character",
  prompt: "Be helpful.",
  ...overrides,
});

describe("buildChatHistory", () => {
  it("is unchanged (no speaker prefix) when speakerNames is omitted - a plain 1:1 chat", () => {
    const messages = [msg(YOU, "hi"), msg(AI, "hello", 1)];
    const history = buildChatHistory(messages);
    expect(history).toEqual([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
    ]);
  });

  it("prefixes an AI message with its speaker's name when speakerNames is provided", () => {
    const messages = [msg(YOU, "hi everyone"), msg(AI, "hey!", 1), msg(AI, "yo", 2)];
    const history = buildChatHistory(messages, { 1: "Aria", 2: "Beck" });
    expect(history).toEqual([
      { role: "user", text: "hi everyone" },
      { role: "assistant", text: "Aria: hey!" },
      { role: "assistant", text: "Beck: yo" },
    ]);
  });

  it("never prefixes a user-role message even if speakerNames is provided", () => {
    const messages = [msg(YOU, "hi", 1)];
    const history = buildChatHistory(messages, { 1: "Aria" });
    expect(history).toEqual([{ role: "user", text: "hi" }]);
  });

  it("leaves an AI message unprefixed when its speakerId has no entry in speakerNames", () => {
    const messages = [msg(AI, "hello", 99)];
    const history = buildChatHistory(messages, { 1: "Aria" });
    expect(history).toEqual([{ role: "assistant", text: "hello" }]);
  });

  it("leaves an AI message with no speakerId unprefixed even when speakerNames is provided", () => {
    const messages = [msg(AI, "hello")];
    const history = buildChatHistory(messages, { 1: "Aria" });
    expect(history).toEqual([{ role: "assistant", text: "hello" }]);
  });
});

describe("buildSystemInstruction", () => {
  it("has no group-conversation section for a plain 1:1 chat", () => {
    const { text } = buildSystemInstruction(makeCharacter());
    expect(text).not.toMatch(/group conversation/i);
  });

  it("adds a group-conversation section naming the other participants when otherParticipants is provided", () => {
    const { text } = buildSystemInstruction(makeCharacter(), undefined, undefined, undefined, undefined, ["Beck", "Vikash"]);
    expect(text).toMatch(/group conversation/i);
    expect(text).toContain("Beck, Vikash");
    expect(text).toContain("Reply only as yourself, Aria");
  });

  it("omits the group-conversation section when otherParticipants is an empty array", () => {
    const { text } = buildSystemInstruction(makeCharacter(), undefined, undefined, undefined, undefined, []);
    expect(text).not.toMatch(/group conversation/i);
  });

  it("has no personality traits section when personalityTraits is unset or empty", () => {
    expect(buildSystemInstruction(makeCharacter()).text).not.toMatch(/key personality traits/i);
    expect(buildSystemInstruction(makeCharacter({ personalityTraits: [] })).text).not.toMatch(/key personality traits/i);
  });

  it("adds a joined key personality traits section when personalityTraits is set", () => {
    const { text } = buildSystemInstruction(makeCharacter({ personalityTraits: ["Kind", "Sarcastic", "Shy"] }));
    expect(text).toContain("Key personality traits: Kind, Sarcastic, Shy.");
  });
});
