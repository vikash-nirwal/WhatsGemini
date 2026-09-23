import { buildChatHistory, buildSystemInstruction, buildTurnContext, buildPostHistoryNote, buildTimeSection } from "./promptComposition";
import { DEFAULT_ROLEPLAY_STYLE } from "../../../utils/constants";
import { YOU, AI } from "../../../utils/constants";
import { Character, Message, UserProfile } from "../../../types";

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

  it("uses the character's own scenario/memory for a 1:1 chat, ignoring any group scenario/memory arguments", () => {
    const character = makeCharacter({ scenario: "A quiet cafe.", memory: ["Likes tea."] });
    const { text } = buildSystemInstruction(character, undefined, undefined, undefined, undefined, undefined, "A stormy ship.", ["Group fact."]);
    expect(text).toContain("A quiet cafe.");
    expect(text).not.toContain("A stormy ship.");
    expect(text).toContain("Likes tea.");
    expect(text).not.toContain("Group fact.");
    expect(text).not.toMatch(/group conversation/i);
  });

  it("in a room, uses the shared group scenario instead of the character's own, and includes both personal and group memory", () => {
    const character = makeCharacter({ scenario: "A quiet cafe.", memory: ["Likes tea."] });
    const { text } = buildSystemInstruction(character, undefined, undefined, undefined, undefined, ["Beck"], "A stormy ship.", ["Everyone is soaked."]);
    expect(text).toContain("A stormy ship.");
    expect(text).not.toContain("A quiet cafe.");
    expect(text).toContain("Likes tea.");
    expect(text).toContain("Everyone is soaked.");
  });

  it("in a room with no group scenario/memory set, omits both sections rather than falling back to the character's own scenario", () => {
    const character = makeCharacter({ scenario: "A quiet cafe.", memory: ["Likes tea."] });
    const { text } = buildSystemInstruction(character, undefined, undefined, undefined, undefined, ["Beck"]);
    expect(text).not.toContain("A quiet cafe.");
    expect(text).not.toMatch(/current scenario/i);
    expect(text).toContain("Likes tea.");
  });
});

describe("buildChatHistory from a room speaker's perspective", () => {
  it("sends only the speaker's own lines as assistant; others and the user arrive as labeled user turns, merged", () => {
    const messages = [msg(YOU, "hi all"), msg(AI, "hey!", 1), msg(AI, "yo", 2), msg(YOU, "what now?")];
    const history = buildChatHistory(messages, { 1: "Aria", 2: "Beck" }, { selfId: 2, userName: "Arin" });
    expect(history).toEqual([
      { role: "user", text: "Arin: hi all\n\nAria: hey!" },
      { role: "assistant", text: "yo" },
      { role: "user", text: "Arin: what now?" },
    ]);
  });
});

describe("buildSystemInstruction additions", () => {
  const persona: UserProfile = { id: "p", name: "Arin", bio: "" };

  it("resolves {{char}}/{{user}} in character fields", () => {
    const { text } = buildSystemInstruction(makeCharacter({ prompt: "{{char}} adores {{user}}." }), undefined, undefined, persona);
    expect(text).toContain("Aria adores Arin.");
  });

  it("does not double the period after a description that already ends with one", () => {
    const { text } = buildSystemInstruction(makeCharacter({ description: "A bard." }));
    expect(text).toContain("Character description: A bard.\n");
  });

  it("includes world tags and pinned memory", () => {
    const { text } = buildSystemInstruction(
      makeCharacter({ pinnedMemory: ["Arin's name is Arin."], memory: ["Likes tea."] }),
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { worldTags: ["Noir", "1920s"] }
    );
    expect(text).toContain("Noir, 1920s");
    expect(text).toContain("- Arin's name is Arin.\n- Likes tea.");
  });

  it("adds roleplay style rules only when set", () => {
    const style = { ...DEFAULT_ROLEPLAY_STYLE, pov: "third" as const, actionsInAsterisks: true, timeAwareness: false };
    const { text } = buildSystemInstruction(makeCharacter(), undefined, undefined, persona, [], undefined, undefined, undefined, { roleplayStyle: style });
    expect(text).toMatch(/third person/);
    expect(text).toMatch(/\*asterisks\*/);
    expect(text).toContain("Never write dialogue, actions, thoughts or decisions for Arin");
    expect(buildSystemInstruction(makeCharacter()).text).not.toMatch(/Roleplay rules/);
  });

  it("matches other room members' lore in a room turn", () => {
    const { text } = buildSystemInstruction(
      makeCharacter(), undefined, undefined, undefined, [msg(YOU, "tell me about the Vault")], ["Beck"], undefined, undefined,
      { roomLoreEntries: [{ id: "l", keywords: ["Vault"], content: "Beck's vault is empty." }] }
    );
    expect(text).toContain("Beck's vault is empty.");
  });
});

describe("buildPostHistoryNote / buildTurnContext", () => {
  it("returns nothing when there's no author's note or post-history instructions", () => {
    expect(buildPostHistoryNote(makeCharacter(), undefined)).toBeUndefined();
  });

  it("combines the author's note and the card's post-history instructions, with macros resolved", () => {
    const note = buildPostHistoryNote(makeCharacter({ postHistoryInstructions: "Never speak for {{user}}." }), "It starts raining.", { id: "p", name: "Arin", bio: "" });
    expect(note).toContain("It starts raining.");
    expect(note).toContain("Never speak for Arin.");
  });

  it("keeps the author's note out of the system prompt", () => {
    const ctx = buildTurnContext([msg(YOU, "hi")], makeCharacter(), undefined, undefined, undefined, undefined, { authorNote: "It starts raining." });
    expect(ctx.systemInstruction).not.toContain("It starts raining.");
    expect(ctx.postHistoryNote).toContain("It starts raining.");
  });
});

describe("buildTimeSection", () => {
  const HOUR = 3600 * 1000;
  const now = Date.UTC(2026, 0, 10, 12);

  it("reports the gap before a just-sent user message", () => {
    const messages: Message[] = [
      { role: AI, txt: "bye", timestamp: now - 3 * 24 * HOUR },
      { role: YOU, txt: "I'm back", timestamp: now - 1000 },
    ];
    expect(buildTimeSection(messages, now)).toContain("About 3 days passed");
  });

  it("reports time since the last message for a character-initiated turn", () => {
    const messages: Message[] = [{ role: AI, txt: "hello?", timestamp: now - 5 * HOUR }];
    expect(buildTimeSection(messages, now)).toContain("About 5 hours passed");
  });

  it("does not mention a short gap", () => {
    const messages: Message[] = [
      { role: AI, txt: "a", timestamp: now - 60 * 1000 },
      { role: YOU, txt: "b", timestamp: now - 1000 },
    ];
    expect(buildTimeSection(messages, now)).not.toMatch(/passed/);
  });
});
